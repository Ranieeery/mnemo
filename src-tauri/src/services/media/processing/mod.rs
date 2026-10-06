//! Background processing: reads the metadata and a thumbnail of every new video below the requested folders.
//!
//! Each requested folder is a job; asking for a folder that is already queued (or inside one) adds nothing. The new
//! files of all jobs are read by a fixed pool of workers, at most `concurrency` at once, and a file claimed by one job
//! is never read by another. Workers never touch the database: a single writer stores their results in batches.
//! Cancelling a job kills the ffmpeg processes it is running and drops its queued files. Nothing is stored halfway,
//! so a cancelled or interrupted job is resumed by asking for the folder again: what was stored is skipped.

mod worker;
mod writer;

#[cfg(test)]
pub(crate) mod tests;

use std::collections::{HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, PoisonError};
use std::time::Duration;

use tokio::sync::{Notify, mpsc};
use tokio_util::sync::CancellationToken;

use super::MediaToolkit;
use crate::db::{Db, videos};
use crate::domain::models::{FileError, ProcessingJob, ProcessingOutcome, ProcessingStatus, ProcessingSummary};
use crate::domain::natural_order::natural_cmp;
use crate::domain::paths::is_within;
use crate::error::AppResult;
use crate::services::scanner;

/// Failures kept for the details view; older ones are dropped.
const MAX_ERRORS: usize = 50;
/// The status is sent at most this often, however busy the workers are.
const STATUS_INTERVAL: Duration = Duration::from_millis(200);

/// Which jobs the workers serve first. Previews (low) never hold up reading new videos (normal).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Priority {
    Normal,
    #[cfg_attr(not(test), allow(dead_code))]
    Low,
}

/// What the pipeline tells the app: its status (throttled) and how each job ended.
pub enum Notification {
    Status(ProcessingStatus),
    Finished(ProcessingOutcome),
}

pub type Notifier = Arc<dyn Fn(Notification) + Send + Sync>;

/// The processing service. Cheap to clone; every clone drives the same queue and workers.
pub struct Processor<T> {
    inner: Arc<Inner<T>>,
}

impl<T> Clone for Processor<T> {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

struct Inner<T> {
    db: Db,
    toolkit: T,
    thumbnails_dir: PathBuf,
    concurrency: usize,
    notify: Notifier,
    state: Mutex<State>,
    /// Wakes idle workers when files are queued.
    work: Notify,
    /// Wakes the status sender; it keeps one pending wake-up, so bursts of changes send one status.
    status_changed: Notify,
    /// Set once the workers run; they start with the first job, inside the async runtime.
    writer: OnceLock<mpsc::UnboundedSender<writer::Read>>,
}

#[derive(Default)]
struct State {
    next_id: u64,
    jobs: Vec<Job>,
    /// Files queued or being read by any job, so no file is read twice.
    claimed: HashSet<String>,
    errors: VecDeque<FileError>,
}

struct Job {
    id: u64,
    folder: String,
    priority: Priority,
    report: bool,
    cancel: CancellationToken,
    scanning: bool,
    pending: VecDeque<PathBuf>,
    reading: Vec<String>,
    /// Files taken by a worker and not yet stored or given up.
    outstanding: usize,
    total: i64,
    done: i64,
    summary: ProcessingSummary,
    missing_tool: bool,
    error: Option<String>,
    removed: bool,
}

impl Job {
    fn is_finished(&self) -> bool {
        !self.scanning && self.pending.is_empty() && self.outstanding == 0
    }

    fn outcome(&self) -> ProcessingOutcome {
        ProcessingOutcome {
            folder: self.folder.clone(),
            summary: self.summary,
            cancelled: self.cancel.is_cancelled(),
            missing_tool: self.missing_tool,
            error: self.error.clone(),
            removed: self.removed,
            report: self.report,
        }
    }
}

/// A file handed to a worker.
struct Task {
    job_id: u64,
    file: PathBuf,
    cancel: CancellationToken,
}

impl<T: MediaToolkit + 'static> Processor<T> {
    pub fn new(db: Db, toolkit: T, thumbnails_dir: PathBuf, concurrency: usize, notify: Notifier) -> Self {
        Self {
            inner: Arc::new(Inner {
                db,
                toolkit,
                thumbnails_dir,
                concurrency: concurrency.max(1),
                notify,
                state: Mutex::new(State::default()),
                work: Notify::new(),
                status_changed: Notify::new(),
                writer: OnceLock::new(),
            }),
        }
    }

    /// Queues the new videos below `folder`. Nothing is added when the folder is already queued, alone or inside
    /// another queued folder; `report` then carries over to that job. Must be called inside the async runtime.
    pub fn enqueue(&self, folder: PathBuf, priority: Priority, report: bool) {
        self.start();
        let job_id = {
            let mut state = self.inner.lock();
            if let Some(job) = state
                .jobs
                .iter_mut()
                .find(|job| !job.cancel.is_cancelled() && is_within(&folder, Path::new(&job.folder)))
            {
                job.report |= report;
                return;
            }
            // A new run starts with a clean error list.
            if state.jobs.is_empty() {
                state.errors.clear();
            }
            state.next_id += 1;
            let id = state.next_id;
            state.jobs.push(Job {
                id,
                folder: folder.to_string_lossy().into_owned(),
                priority,
                report,
                cancel: CancellationToken::new(),
                scanning: true,
                pending: VecDeque::new(),
                reading: Vec::new(),
                outstanding: 0,
                total: 0,
                done: 0,
                summary: ProcessingSummary::default(),
                missing_tool: false,
                error: None,
                removed: false,
            });
            id
        };
        self.inner.status_changed.notify_one();
        let inner = Arc::clone(&self.inner);
        tokio::spawn(async move { inner.scan(job_id, folder).await });
    }

    /// Cancels the job of `folder`, or every job when `None`. Running ffmpeg processes are killed; what was already
    /// stored stays.
    pub fn cancel(&self, folder: Option<&Path>) {
        self.inner.cancel_where(
            |job| folder.is_none_or(|folder| Path::new(&job.folder) == folder),
            false,
        );
    }

    /// Stops reading `folder` and everything inside it because it left the library. Videos read meanwhile are not
    /// stored either: the writer only keeps videos inside library folders.
    pub fn forget(&self, folder: &Path) {
        self.inner
            .cancel_where(|job| is_within(Path::new(&job.folder), folder), true);
    }

    pub fn status(&self) -> ProcessingStatus {
        self.inner.status()
    }

    fn start(&self) {
        self.inner.writer.get_or_init(|| {
            let (sender, receiver) = mpsc::unbounded_channel();
            tokio::spawn(writer::run(Arc::clone(&self.inner), receiver));
            for _ in 0..self.inner.concurrency {
                tokio::spawn(worker::run(Arc::clone(&self.inner)));
            }
            tokio::spawn(send_status(Arc::clone(&self.inner)));
            sender
        });
    }
}

impl<T: MediaToolkit + 'static> Inner<T> {
    fn lock(&self) -> MutexGuard<'_, State> {
        // A panic while holding the lock leaves plain counters behind; carrying on is better than stopping for good.
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn status(&self) -> ProcessingStatus {
        let state = self.lock();
        ProcessingStatus {
            jobs: state
                .jobs
                .iter()
                .map(|job| ProcessingJob {
                    folder: job.folder.clone(),
                    scanning: job.scanning,
                    total: job.total,
                    done: job.done,
                    failed: job.summary.failed,
                })
                .collect(),
            in_flight: state.jobs.iter().flat_map(|job| job.reading.iter().cloned()).collect(),
            cancelling: state.jobs.iter().any(|job| job.cancel.is_cancelled()),
            errors: state.errors.iter().cloned().collect(),
        }
    }

    fn cancel_where(&self, matches: impl Fn(&Job) -> bool, removed: bool) {
        let finished = {
            let mut state = self.lock();
            let State { jobs, claimed, .. } = &mut *state;
            for job in jobs.iter_mut().filter(|job| matches(job)) {
                job.cancel.cancel();
                job.removed |= removed;
                for file in job.pending.drain(..) {
                    claimed.remove(file.to_string_lossy().as_ref());
                }
            }
            take_finished(&mut state)
        };
        self.report(finished);
    }

    /// Sends the outcome of finished jobs and a fresh status.
    fn report(&self, finished: Vec<ProcessingOutcome>) {
        for outcome in finished {
            (self.notify)(Notification::Finished(outcome));
        }
        self.status_changed.notify_one();
    }

    /// Lists the folder's videos and queues the ones neither stored nor claimed by another job.
    async fn scan(&self, job_id: u64, folder: PathBuf) {
        let found = self.new_files(folder).await;
        let finished = {
            let mut state = self.lock();
            let State { jobs, claimed, .. } = &mut *state;
            if let Some(job) = jobs.iter_mut().find(|job| job.id == job_id) {
                job.scanning = false;
                match found {
                    Ok(_) if job.cancel.is_cancelled() => {}
                    Ok((files, stored)) => {
                        job.summary.skipped += stored;
                        for file in files {
                            if claimed.insert(file.to_string_lossy().into_owned()) {
                                job.pending.push_back(file);
                            } else {
                                job.summary.skipped += 1;
                            }
                        }
                        job.total = job.pending.len() as i64;
                    }
                    Err(error) => job.error = Some(error.to_string()),
                }
            }
            take_finished(&mut state)
        };
        self.work.notify_waiters();
        self.report(finished);
    }

    /// The videos below `folder` that are not in the library yet, in natural order, and how many already are.
    async fn new_files(&self, folder: PathBuf) -> AppResult<(Vec<PathBuf>, i64)> {
        let root = folder.clone();
        let mut files = tokio::task::spawn_blocking(move || scanner::walk_videos(&root, |_, _| Ok(()))).await??;
        files.sort_by(|a, b| natural_cmp(&a.to_string_lossy(), &b.to_string_lossy()));
        let folder_text = folder.to_string_lossy().into_owned();
        let stored: HashSet<String> = self
            .db
            .call(move |connection| videos::in_folder(connection, &folder_text, true))
            .await?
            .into_iter()
            .map(|video| video.file_path)
            .collect();
        let total = files.len();
        files.retain(|file| !stored.contains(file.to_string_lossy().as_ref()));
        let already_stored = (total - files.len()) as i64;
        Ok((files, already_stored))
    }

    /// The next file to read: from the highest priority job, oldest first.
    fn take_next(&self) -> Option<Task> {
        let mut state = self.lock();
        let job = state
            .jobs
            .iter_mut()
            .filter(|job| !job.pending.is_empty())
            .min_by_key(|job| (job.priority, job.id))?;
        let file = job.pending.pop_front()?;
        job.reading.push(file.to_string_lossy().into_owned());
        job.outstanding += 1;
        Some(Task {
            job_id: job.id,
            file,
            cancel: job.cancel.clone(),
        })
    }

    /// Settles files that are done with, whatever happened to them: they free their claim, and their job finishes
    /// once nothing else is left. `update` records what happened in the job.
    fn settle(&self, job_id: u64, files: &[String], update: impl FnOnce(&mut Job, &mut VecDeque<FileError>)) {
        let finished = {
            let mut state = self.lock();
            let State {
                jobs, claimed, errors, ..
            } = &mut *state;
            for file in files {
                claimed.remove(file);
            }
            if let Some(job) = jobs.iter_mut().find(|job| job.id == job_id) {
                job.reading.retain(|reading| !files.contains(reading));
                job.outstanding = job.outstanding.saturating_sub(files.len());
                update(job, errors);
            }
            while errors.len() > MAX_ERRORS {
                errors.pop_front();
            }
            take_finished(&mut state)
        };
        self.report(finished);
    }
}

/// Removes finished jobs and returns how they ended.
fn take_finished(state: &mut State) -> Vec<ProcessingOutcome> {
    let mut finished = Vec::new();
    state.jobs.retain(|job| {
        if job.is_finished() {
            finished.push(job.outcome());
            false
        } else {
            true
        }
    });
    finished
}

/// Sends the status when it changes, at most every `STATUS_INTERVAL`.
async fn send_status<T: MediaToolkit + 'static>(inner: Arc<Inner<T>>) {
    loop {
        inner.status_changed.notified().await;
        (inner.notify)(Notification::Status(inner.status()));
        tokio::time::sleep(STATUS_INTERVAL).await;
    }
}
