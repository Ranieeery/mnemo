//! Background processing: finds videos below a folder, skips the ones already in the library and extracts metadata
//! and a thumbnail for the rest. Sequential for now; the per-file step is isolated so bounded concurrency and
//! cancellation can be added later without changing callers.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use super::{MediaToolkit, thumbnails};
use crate::db::{Db, videos};
use crate::domain::media::{display_name, title_from_path};
use crate::domain::models::{ProcessingEvent, ProcessingSummary};
use crate::domain::natural_order::natural_cmp;
use crate::error::{AppError, AppResult};
use crate::services::scanner;

pub async fn process_folder<T: MediaToolkit>(
    db: &Db,
    toolkit: &T,
    thumbnails_dir: &Path,
    folder: &Path,
    on_event: impl Fn(ProcessingEvent),
) -> AppResult<ProcessingSummary> {
    let root = folder.to_path_buf();
    let mut files = tokio::task::spawn_blocking(move || scanner::walk_videos(&root, |_, _| Ok(()))).await??;
    files.sort_by(|a, b| natural_cmp(&a.to_string_lossy(), &b.to_string_lossy()));

    let folder_text = folder.to_string_lossy().into_owned();
    let query_folder = folder_text.clone();
    let known: HashSet<String> = db
        .call(move |connection| videos::in_folder(connection, &query_folder, true))
        .await?
        .into_iter()
        .map(|video| video.file_path)
        .collect();

    let total = files.len() as i64;
    on_event(ProcessingEvent::Started {
        folder: folder_text,
        total,
    });

    let mut summary = ProcessingSummary::default();
    for (done, file) in files.iter().enumerate() {
        if known.contains(file.to_string_lossy().as_ref()) {
            summary.skipped += 1;
            continue;
        }
        on_event(ProcessingEvent::Progress {
            done: done as i64,
            total,
            current_file: display_name(file),
        });
        match process_file(db, toolkit, thumbnails_dir, file).await {
            Ok(()) => summary.processed += 1,
            // Every remaining file would fail the same way.
            Err(error @ AppError::MediaToolMissing { .. }) => return Err(error),
            Err(error) => {
                tracing::warn!(file = %file.display(), %error, "failed to process video");
                summary.failed += 1;
            }
        }
    }
    on_event(ProcessingEvent::Finished(summary));
    Ok(summary)
}

async fn process_file<T: MediaToolkit>(db: &Db, toolkit: &T, thumbnails_dir: &Path, file: &Path) -> AppResult<()> {
    let duration = toolkit.probe(file).await?;
    let thumbnail = thumbnails::file_for(thumbnails_dir, file);
    // A video without a thumbnail is still worth listing; the UI shows a placeholder.
    let thumbnail = match toolkit
        .thumbnail(file, &thumbnail, thumbnails::capture_time(duration))
        .await
    {
        Ok(()) => Some(thumbnail),
        Err(error @ AppError::MediaToolMissing { .. }) => return Err(error),
        Err(error) => {
            tracing::warn!(file = %file.display(), %error, "failed to generate thumbnail");
            None
        }
    };

    let file_path = file.to_string_lossy().into_owned();
    let title = title_from_path(file);
    let thumbnail_path = thumbnail.map(|path: PathBuf| path.to_string_lossy().into_owned());
    db.call(move |connection| {
        videos::insert(
            connection,
            &videos::NewVideo {
                file_path: &file_path,
                title: &title,
                duration_seconds: duration,
                thumbnail_path: thumbnail_path.as_deref(),
            },
        )
    })
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;
    use crate::services::scanner::tests::tree;

    /// Toolkit double: durations come from the file name length, failures are triggered by name.
    struct FakeToolkit {
        missing_tools: bool,
    }

    impl MediaToolkit for FakeToolkit {
        async fn probe(&self, video: &Path) -> AppResult<f64> {
            let name = display_name(video);
            if self.missing_tools {
                return Err(AppError::MediaToolMissing { tool: "ffprobe".into() });
            }
            if name.starts_with("broken") {
                return Err(AppError::MediaProcessFailed {
                    tool: "ffprobe".into(),
                    message: "invalid data".into(),
                });
            }
            Ok(name.len() as f64 * 60.0)
        }

        async fn thumbnail(&self, video: &Path, output: &Path, _at_seconds: f64) -> AppResult<()> {
            if display_name(video).starts_with("nothumb") {
                return Err(AppError::MediaProcessFailed {
                    tool: "ffmpeg".into(),
                    message: "no frame".into(),
                });
            }
            std::fs::write(output, b"jpg").map_err(|error| AppError::io(output, error))
        }
    }

    #[tokio::test]
    async fn processes_new_videos_and_skips_known_ones() {
        let library = tree(&[
            "Ep 2.mkv",
            "Ep 10.mkv",
            "sub/broken.mkv",
            "sub/nothumb.mp4",
            "notes.txt",
        ]);
        let thumbnails_dir = tempfile::tempdir().unwrap();
        let db = Db::open_in_memory().unwrap();
        let events = Mutex::new(Vec::new());
        let toolkit = FakeToolkit { missing_tools: false };

        let summary = process_folder(&db, &toolkit, thumbnails_dir.path(), library.path(), |event| {
            events.lock().unwrap().push(event);
        })
        .await
        .unwrap();
        assert_eq!(
            summary,
            ProcessingSummary {
                processed: 3,
                skipped: 0,
                failed: 1
            }
        );

        let events = events.into_inner().unwrap();
        assert!(matches!(
            events.first(),
            Some(ProcessingEvent::Started { total: 4, .. })
        ));
        assert!(matches!(events.last(), Some(ProcessingEvent::Finished(_))));

        let folder = library.path().to_string_lossy().into_owned();
        let stored = db
            .call(move |connection| videos::in_folder(connection, &folder, true))
            .await
            .unwrap();
        assert_eq!(stored.len(), 3);
        let episode = stored.iter().find(|video| video.title == "Ep 2").unwrap();
        assert_eq!(episode.duration_seconds, 480.0);
        assert!(Path::new(episode.thumbnail_path.as_deref().unwrap()).exists());
        let without_thumbnail = stored.iter().find(|video| video.title == "nothumb").unwrap();
        assert_eq!(without_thumbnail.thumbnail_path, None);

        let again = process_folder(&db, &toolkit, thumbnails_dir.path(), library.path(), |_| {})
            .await
            .unwrap();
        assert_eq!(
            again,
            ProcessingSummary {
                processed: 0,
                skipped: 3,
                failed: 1
            }
        );
    }

    #[tokio::test]
    async fn stops_when_the_tools_are_missing() {
        let library = tree(&["a.mkv", "b.mkv"]);
        let thumbnails_dir = tempfile::tempdir().unwrap();
        let db = Db::open_in_memory().unwrap();
        let result = process_folder(
            &db,
            &FakeToolkit { missing_tools: true },
            thumbnails_dir.path(),
            library.path(),
            |_| {},
        )
        .await;
        assert!(matches!(result, Err(AppError::MediaToolMissing { .. })));
    }
}
