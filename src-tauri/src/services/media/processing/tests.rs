use std::path::Path;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use tokio::sync::Notify;

use super::*;
use crate::domain::media::display_name;
use crate::error::AppError;
use crate::services::scanner::tests::tree;

/// Toolkit double: reading takes `delay` (and can be cancelled meanwhile); files named "broken…" cannot be read,
/// "nothumb…" have no thumbnail. Records how many files it reads at once.
#[derive(Default)]
pub(crate) struct FakeToolkit {
    pub delay: Duration,
    pub missing_tools: bool,
    pub reading: AtomicUsize,
    pub peak: AtomicUsize,
    pub probed: Mutex<Vec<String>>,
}

impl FakeToolkit {
    pub fn slow(delay: Duration) -> Self {
        Self {
            delay,
            ..Self::default()
        }
    }
}

impl MediaToolkit for FakeToolkit {
    async fn probe(&self, video: &Path, cancel: &CancellationToken) -> AppResult<f64> {
        let name = display_name(video);
        if self.missing_tools {
            return Err(AppError::MediaToolMissing { tool: "ffprobe".into() });
        }
        self.probed.lock().unwrap().push(name.clone());
        let now = self.reading.fetch_add(1, Ordering::SeqCst) + 1;
        self.peak.fetch_max(now, Ordering::SeqCst);
        let result = tokio::select! {
            () = tokio::time::sleep(self.delay) => Ok(name.len() as f64 * 60.0),
            () = cancel.cancelled() => Err(AppError::Cancelled),
        };
        self.reading.fetch_sub(1, Ordering::SeqCst);
        if name.starts_with("broken") {
            return Err(AppError::MediaProcessFailed {
                tool: "ffprobe".into(),
                message: "invalid data".into(),
            });
        }
        result
    }

    async fn thumbnail(&self, video: &Path, output: &Path, _at: f64, _cancel: &CancellationToken) -> AppResult<()> {
        if display_name(video).starts_with("nothumb") {
            return Err(AppError::MediaProcessFailed {
                tool: "ffmpeg".into(),
                message: "no frame".into(),
            });
        }
        std::fs::write(output, b"jpg").map_err(|error| AppError::io(output, error))
    }
}

/// A processor over a fake toolkit that records every outcome and lets tests wait for them.
pub(crate) struct Harness {
    pub processor: Processor<FakeToolkit>,
    pub db: Db,
    pub thumbnails_dir: tempfile::TempDir,
    outcomes: Arc<Mutex<Vec<ProcessingOutcome>>>,
    arrived: Arc<Notify>,
}

impl Harness {
    pub fn new(toolkit: FakeToolkit, concurrency: usize) -> Self {
        Self::with_db(Db::open_in_memory().unwrap(), toolkit, concurrency)
    }

    pub fn with_db(db: Db, toolkit: FakeToolkit, concurrency: usize) -> Self {
        let thumbnails_dir = tempfile::tempdir().unwrap();
        let outcomes = Arc::new(Mutex::new(Vec::new()));
        let arrived = Arc::new(Notify::new());
        let notifier: Notifier = {
            let outcomes = Arc::clone(&outcomes);
            let arrived = Arc::clone(&arrived);
            Arc::new(move |notification| {
                if let Notification::Finished(outcome) = notification {
                    outcomes.lock().unwrap().push(outcome);
                    arrived.notify_one();
                }
            })
        };
        let processor = Processor::new(
            db.clone(),
            toolkit,
            thumbnails_dir.path().to_path_buf(),
            concurrency,
            notifier,
        );
        Self {
            processor,
            db,
            thumbnails_dir,
            outcomes,
            arrived,
        }
    }

    /// Waits until `count` jobs have ended in total, and returns their outcomes in order.
    pub async fn outcomes(&self, count: usize) -> Vec<ProcessingOutcome> {
        tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                let arrived = self.arrived.notified();
                if self.outcomes.lock().unwrap().len() >= count {
                    return self.outcomes.lock().unwrap().clone();
                }
                arrived.await;
            }
        })
        .await
        .unwrap()
    }

    pub fn toolkit(&self) -> &FakeToolkit {
        &self.processor.inner.toolkit
    }

    /// Every stored video: its path and thumbnail.
    pub async fn stored(&self) -> Vec<(String, Option<String>)> {
        self.db
            .call(|connection| {
                let mut statement = connection.prepare("SELECT file_path, thumbnail_path FROM videos")?;
                let rows = statement
                    .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await
            .unwrap()
    }

    pub fn thumbnail_files(&self) -> usize {
        std::fs::read_dir(self.thumbnails_dir.path()).unwrap().count()
    }
}

fn names(count: usize) -> Vec<String> {
    (1..=count).map(|index| format!("Ep {index}.mkv")).collect()
}

fn library(files: &[String]) -> tempfile::TempDir {
    tree(&files.iter().map(String::as_str).collect::<Vec<_>>())
}

#[tokio::test]
async fn reads_new_videos_skips_stored_ones_and_reports_failures() {
    let dir = tree(&[
        "Ep 2.mkv",
        "Ep 10.mkv",
        "sub/broken.mkv",
        "sub/nothumb.mp4",
        "notes.txt",
    ]);
    let harness = Harness::new(FakeToolkit::default(), 2);

    harness
        .processor
        .enqueue(dir.path().to_path_buf(), Priority::Normal, true);
    let outcome = harness.outcomes(1).await.remove(0);
    assert_eq!(
        outcome.summary,
        ProcessingSummary {
            processed: 3,
            skipped: 0,
            failed: 1
        }
    );
    assert!(outcome.report && !outcome.cancelled && !outcome.missing_tool);
    let stored = harness.stored().await;
    assert_eq!(stored.len(), 3);
    // The video without a thumbnail is still listed; only the other two have thumbnail files.
    assert_eq!(stored.iter().filter(|(_, thumbnail)| thumbnail.is_some()).count(), 2);
    assert_eq!(harness.thumbnail_files(), 2);
    let errors = harness.processor.status().errors;
    assert_eq!(errors.len(), 1);
    assert!(errors[0].path.ends_with("broken.mkv"));

    // Running again finds everything stored.
    harness
        .processor
        .enqueue(dir.path().to_path_buf(), Priority::Normal, false);
    let again = harness.outcomes(2).await.remove(1);
    assert_eq!(again.summary.processed, 0);
    assert_eq!(again.summary.skipped, 3);
}

#[tokio::test]
async fn never_reads_more_files_at_once_than_allowed() {
    let dir = library(&names(12));
    let harness = Harness::new(FakeToolkit::slow(Duration::from_millis(30)), 3);
    harness
        .processor
        .enqueue(dir.path().to_path_buf(), Priority::Normal, false);
    harness.outcomes(1).await;

    let peak = harness.toolkit().peak.load(Ordering::SeqCst);
    assert!(peak <= 3, "{peak}");
    assert!(peak > 1, "files were read one at a time");
    assert_eq!(harness.stored().await.len(), 12);
}

#[tokio::test]
async fn reads_each_file_once_whatever_is_asked() {
    let dir = tree(&["Show/Ep 1.mkv", "Show/Ep 2.mkv", "Show/Season 2/Ep 3.mkv", "Other.mkv"]);
    let harness = Harness::new(FakeToolkit::slow(Duration::from_millis(20)), 2);
    let show = dir.path().join("Show");

    // The subfolder first, then the folder around it (twice), then the same subfolder again.
    harness
        .processor
        .enqueue(show.join("Season 2"), Priority::Normal, false);
    harness.processor.enqueue(show.clone(), Priority::Normal, false);
    harness.processor.enqueue(show.clone(), Priority::Normal, true);
    harness
        .processor
        .enqueue(show.join("Season 2"), Priority::Normal, false);
    let outcomes = harness.outcomes(2).await;

    let mut probed = harness.toolkit().probed.lock().unwrap().clone();
    probed.sort();
    assert_eq!(probed, ["Ep 1.mkv", "Ep 2.mkv", "Ep 3.mkv"]);
    assert_eq!(outcomes.len(), 2);
    // The repeated request asked for a report; the job that was already queued carries it.
    assert!(
        outcomes
            .iter()
            .any(|outcome| outcome.report && outcome.folder.ends_with("Show"))
    );
}

#[tokio::test]
async fn cancelling_a_job_stops_it_without_leaving_anything_halfway() {
    let dir = library(&names(10));
    let harness = Harness::new(FakeToolkit::slow(Duration::from_millis(150)), 2);
    harness
        .processor
        .enqueue(dir.path().to_path_buf(), Priority::Normal, false);
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert_eq!(harness.processor.status().in_flight.len(), 2);

    harness.processor.cancel(Some(dir.path()));
    let outcome = harness.outcomes(1).await.remove(0);
    assert!(outcome.cancelled);
    assert!(outcome.summary.processed < 10);
    // Every stored video has its thumbnail, and no thumbnail is left without a video.
    let stored = harness.stored().await;
    assert_eq!(stored.len() as i64, outcome.summary.processed);
    assert_eq!(harness.thumbnail_files(), stored.len());
    assert!(harness.processor.status().jobs.is_empty());

    // Asking again resumes: what was stored is skipped and the rest is read.
    harness
        .processor
        .enqueue(dir.path().to_path_buf(), Priority::Normal, false);
    let resumed = harness.outcomes(2).await.remove(1);
    assert_eq!(resumed.summary.skipped, outcome.summary.processed);
    assert_eq!(harness.stored().await.len(), 10);
}

#[tokio::test]
async fn cancelling_one_job_keeps_the_others_going() {
    let first = library(&names(6));
    let second = library(&names(3));
    let harness = Harness::new(FakeToolkit::slow(Duration::from_millis(40)), 2);
    harness
        .processor
        .enqueue(first.path().to_path_buf(), Priority::Normal, false);
    harness
        .processor
        .enqueue(second.path().to_path_buf(), Priority::Normal, false);
    harness.processor.cancel(Some(first.path()));

    let outcomes = harness.outcomes(2).await;
    let finished_second = outcomes
        .iter()
        .find(|outcome| Path::new(&outcome.folder) == second.path())
        .unwrap();
    assert!(!finished_second.cancelled);
    assert_eq!(finished_second.summary.processed, 3);
}

#[tokio::test]
async fn cancelling_everything_empties_the_queue() {
    let first = library(&names(5));
    let second = library(&names(5));
    let harness = Harness::new(FakeToolkit::slow(Duration::from_millis(100)), 1);
    harness
        .processor
        .enqueue(first.path().to_path_buf(), Priority::Normal, false);
    harness
        .processor
        .enqueue(second.path().to_path_buf(), Priority::Normal, false);
    tokio::time::sleep(Duration::from_millis(30)).await;
    harness.processor.cancel(None);

    let outcomes = harness.outcomes(2).await;
    assert!(outcomes.iter().all(|outcome| outcome.cancelled));
    assert!(harness.processor.status().jobs.is_empty());
}

#[tokio::test]
async fn a_missing_tool_stops_every_job_once() {
    let first = library(&names(4));
    let second = library(&names(4));
    let harness = Harness::new(
        FakeToolkit {
            missing_tools: true,
            ..FakeToolkit::default()
        },
        2,
    );
    harness
        .processor
        .enqueue(first.path().to_path_buf(), Priority::Normal, false);
    harness
        .processor
        .enqueue(second.path().to_path_buf(), Priority::Normal, false);

    let outcomes = harness.outcomes(2).await;
    assert!(outcomes.iter().all(|outcome| outcome.missing_tool));
    assert!(harness.stored().await.is_empty());
    // Nothing is reported as a per-file failure.
    assert!(harness.processor.status().errors.is_empty());
}

#[tokio::test]
async fn serves_normal_jobs_before_low_priority_ones() {
    let low = library(&names(3));
    let normal = library(&names(3));
    let harness = Harness::new(FakeToolkit::slow(Duration::from_millis(20)), 1);
    harness
        .processor
        .enqueue(low.path().to_path_buf(), Priority::Low, false);
    // Let the low job list its files before the normal one arrives.
    tokio::time::sleep(Duration::from_millis(10)).await;
    harness
        .processor
        .enqueue(normal.path().to_path_buf(), Priority::Normal, false);

    let outcomes = harness.outcomes(2).await;
    assert_eq!(Path::new(&outcomes[0].folder), normal.path());
}

#[tokio::test]
async fn a_folder_that_cannot_be_read_ends_with_its_error() {
    let harness = Harness::new(FakeToolkit::default(), 1);
    let missing = tempfile::tempdir().unwrap().path().join("gone");
    harness.processor.enqueue(missing, Priority::Normal, false);
    let outcome = harness.outcomes(1).await.remove(0);
    assert!(outcome.error.is_some());
}

#[tokio::test]
async fn status_shows_the_jobs_and_the_files_being_read() {
    let dir = library(&names(4));
    let harness = Harness::new(FakeToolkit::slow(Duration::from_millis(100)), 2);
    harness
        .processor
        .enqueue(dir.path().to_path_buf(), Priority::Normal, false);
    tokio::time::sleep(Duration::from_millis(50)).await;

    let status = harness.processor.status();
    assert_eq!(status.jobs.len(), 1);
    assert_eq!(status.jobs[0].total, 4);
    assert!(!status.jobs[0].scanning);
    assert_eq!(status.in_flight.len(), 2);
    assert!(!status.cancelling);

    harness.outcomes(1).await;
    assert_eq!(harness.processor.status(), ProcessingStatus::default());
}
