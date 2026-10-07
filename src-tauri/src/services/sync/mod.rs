//! Keeps the library in step with the disk.
//!
//! A single loop handles everything in order, so two comparisons never race: the comparison of every reachable
//! library folder at startup, the changes reported by the watcher, folders that came back online, folders checked
//! periodically because they cannot be watched, and "Sync folder" requests. New files go to the processing pipeline;
//! renames and moves keep the video's record; vanished files are marked missing, and those missing for 30 days are
//! deleted at startup. Once the startup work is done, videos stored before 2.3 are fingerprinted one by one whenever
//! the pipeline is idle.

mod disk;
mod follow;
pub mod identity;
mod reconcile;
mod roots;
mod upkeep;
mod watch;

#[cfg(test)]
mod tests;

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use tokio::sync::{mpsc, oneshot};

use self::watch::{Change, Watcher};
use crate::db::Db;
use crate::domain::models::{FolderWatch, LibraryFolderStatus};
use crate::services::media::MediaToolkit;
use crate::services::media::processing::Processor;

/// Delays of the sync loop; tests shorten them.
#[derive(Debug, Clone, Copy)]
pub struct Timing {
    /// Lets the window open before the startup comparison reads the disks.
    pub start_delay: Duration,
    /// Quiet time before watcher events are handled together.
    pub debounce: Duration,
    /// How long a new file must keep its size before it is read.
    pub settle: Duration,
    /// How often library folders are checked for being reachable.
    pub check_interval: Duration,
    /// How often a folder that cannot be watched is compared.
    pub poll_interval: Duration,
    /// When a file still being copied is looked at again.
    pub retry_delay: Duration,
    /// How often the backfill checks whether the pipeline became idle.
    pub idle_check: Duration,
}

impl Timing {
    pub const APP: Self = Self {
        start_delay: Duration::from_secs(3),
        debounce: Duration::from_secs(2),
        settle: identity::SETTLE_TIME,
        check_interval: Duration::from_secs(10),
        poll_interval: Duration::from_secs(10 * 60),
        retry_delay: Duration::from_secs(5),
        idle_check: Duration::from_secs(1),
    };
}

/// What the sync tells the app.
pub enum SyncNotification {
    /// Videos or files changed: screens showing the library are stale.
    LibraryChanged,
    /// A library folder became reachable or unreachable, or its watching changed.
    FoldersChanged,
}

pub type SyncNotifier = Arc<dyn Fn(SyncNotification) + Send + Sync>;

enum Request {
    Changes(Vec<Change>),
    WatchFailed {
        paths: Vec<PathBuf>,
        reason: String,
        limit: bool,
    },
    /// Check the library folders: added, removed, reachable again, due for a periodic comparison.
    Refresh,
    /// Compare these paths now, without reading new files (the caller does), and say when done.
    Reconcile {
        paths: Vec<PathBuf>,
        done: oneshot::Sender<()>,
    },
}

/// The sync service. Cheap to clone; every clone drives the same loop.
pub struct LibrarySync<T> {
    inner: Arc<Inner<T>>,
}

impl<T> Clone for LibrarySync<T> {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

struct Inner<T> {
    db: Db,
    processor: Processor<T>,
    thumbnails_dir: PathBuf,
    timing: Timing,
    notify: SyncNotifier,
    requests: mpsc::UnboundedSender<Request>,
    receiver: Mutex<Option<mpsc::UnboundedReceiver<Request>>>,
    state: Mutex<State>,
}

struct State {
    enabled: bool,
    roots: BTreeMap<String, Root>,
    /// Created when watching is first needed.
    watcher: Option<Watcher>,
}

struct Root {
    watch: FolderWatch,
    reason: Option<String>,
    last_compared: Instant,
}

impl<T: MediaToolkit + 'static> LibrarySync<T> {
    /// `enabled`: whether folders are watched live (the "Watch folders for changes" setting).
    pub fn new(
        db: Db,
        processor: Processor<T>,
        thumbnails_dir: PathBuf,
        enabled: bool,
        timing: Timing,
        notify: SyncNotifier,
    ) -> Self {
        let (requests, receiver) = mpsc::unbounded_channel();
        Self {
            inner: Arc::new(Inner {
                db,
                processor,
                thumbnails_dir,
                timing,
                notify,
                requests,
                receiver: Mutex::new(Some(receiver)),
                state: Mutex::new(State {
                    enabled,
                    roots: BTreeMap::new(),
                    watcher: None,
                }),
            }),
        }
    }

    /// Starts the loop; later calls do nothing. Must be called inside the async runtime.
    pub fn start(&self) {
        let Some(receiver) = self
            .inner
            .receiver
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take()
        else {
            return;
        };
        let inner = Arc::clone(&self.inner);
        tokio::spawn(async move { inner.run(receiver).await });
    }

    /// Picks up library folders added or removed.
    pub fn refresh(&self) {
        let _ = self.inner.requests.send(Request::Refresh);
    }

    /// Turns live watching on or off.
    pub fn set_enabled(&self, enabled: bool) {
        self.inner.lock().enabled = enabled;
        self.refresh();
    }

    /// Compares `paths` with the disk now (renamed, moved and vanished files), waiting for any work in progress.
    /// New files are left to the caller.
    pub async fn reconcile_now(&self, paths: Vec<PathBuf>) {
        let (done, finished) = oneshot::channel();
        if self.inner.requests.send(Request::Reconcile { paths, done }).is_ok() {
            let _ = finished.await;
        }
    }

    /// How each library folder is kept in step, once the loop started.
    pub fn statuses(&self) -> Vec<LibraryFolderStatus> {
        self.inner
            .lock()
            .roots
            .iter()
            .map(|(path, root)| LibraryFolderStatus {
                path: path.clone(),
                watch: root.watch,
                reason: root.reason.clone(),
            })
            .collect()
    }
}

impl<T: MediaToolkit + 'static> Inner<T> {
    fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    async fn run(self: Arc<Self>, mut receiver: mpsc::UnboundedReceiver<Request>) {
        tokio::time::sleep(self.timing.start_delay).await;
        let reachable = self.refresh_roots().await;
        self.compare(reachable.iter().map(PathBuf::from).collect(), true).await;
        self.delete_old_missing().await;
        let backfill = Arc::clone(&self);
        tokio::spawn(async move {
            if let Err(error) = backfill.backfill().await {
                tracing::warn!(%error, "failed to fingerprint videos stored before 2.3");
            }
        });
        tokio::spawn(Arc::clone(&self).check_periodically());

        while let Some(first) = receiver.recv().await {
            let mut batch = vec![first];
            while let Ok(next) = receiver.try_recv() {
                batch.push(next);
            }
            self.handle(batch).await;
        }
    }

    async fn check_periodically(self: Arc<Self>) {
        let mut interval = tokio::time::interval(self.timing.check_interval);
        interval.tick().await;
        loop {
            interval.tick().await;
            if self.requests.send(Request::Refresh).is_err() {
                return;
            }
        }
    }

    async fn handle(self: &Arc<Self>, batch: Vec<Request>) {
        let mut changes = Vec::new();
        let mut refresh = false;
        let mut reconcile_requests = Vec::new();
        for request in batch {
            match request {
                Request::Changes(more) => changes.extend(more),
                Request::WatchFailed { paths, reason, limit } => {
                    changes.extend(self.watch_failed(&paths, reason, limit));
                }
                Request::Refresh => refresh = true,
                Request::Reconcile { paths, done } => reconcile_requests.push((paths, done)),
            }
        }
        if refresh {
            let due = self.refresh_roots().await;
            changes.extend(due.into_iter().map(|root| Change::Rescan(Some(PathBuf::from(root)))));
        }
        if !changes.is_empty() {
            let paths = self.follow_renames(changes).await;
            self.compare(paths, true).await;
        }
        for (paths, done) in reconcile_requests {
            self.compare(paths, false).await;
            let _ = done.send(());
        }
    }
}
