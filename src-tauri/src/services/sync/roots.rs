//! The library folders the sync keeps track of: which are reachable, and how each is watched.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use super::watch::{Change, Signal, Watcher};
use super::{Inner, Request, Root, State, SyncNotification};
use crate::db::folders;
use crate::domain::models::FolderWatch;
use crate::domain::paths::is_within;
use crate::services::media::MediaToolkit;

impl<T: MediaToolkit + 'static> Inner<T> {
    /// Brings the folder list up to date: checks which folders are reachable and (un)watches them. Returns the
    /// folders to compare now: added, reachable again, or due for their periodic comparison.
    pub(super) async fn refresh_roots(self: &Arc<Self>) -> Vec<String> {
        let library = match self.db.call(|connection| folders::paths(connection)).await {
            Ok(library) => library,
            Err(error) => {
                tracing::warn!(%error, "failed to list library folders");
                return Vec::new();
            }
        };
        let inner = Arc::clone(self);
        // Checking a drive can block (a sleeping disk, an offline share), and so can watching a large tree.
        let (due, changed) = match tokio::task::spawn_blocking(move || inner.refresh_roots_blocking(library)).await {
            Ok(result) => result,
            Err(error) => {
                tracing::warn!(%error, "failed to check library folders");
                return Vec::new();
            }
        };
        if changed {
            (self.notify)(SyncNotification::FoldersChanged);
        }
        due
    }

    pub(super) fn refresh_roots_blocking(&self, library: Vec<String>) -> (Vec<String>, bool) {
        let reachable: Vec<(String, bool)> = library
            .into_iter()
            .map(|root| {
                let reachable = Path::new(&root).is_dir();
                (root, reachable)
            })
            .collect();
        let mut state = self.lock();
        let mut changed = false;
        let removed: Vec<String> = state
            .roots
            .keys()
            .filter(|root| !reachable.iter().any(|(path, _)| path == *root))
            .cloned()
            .collect();
        for root in removed {
            if let Some(watcher) = &mut state.watcher {
                watcher.unwatch(Path::new(&root));
            }
            state.roots.remove(&root);
            changed = true;
        }

        let mut due = Vec::new();
        for (path, reachable) in reachable {
            let previous = state.roots.get(&path).map(|root| root.watch);
            let (watch, reason) = match (reachable, previous) {
                (false, _) => {
                    if previous.is_some_and(|watch| watch != FolderWatch::Unavailable)
                        && let Some(watcher) = &mut state.watcher
                    {
                        watcher.unwatch(Path::new(&path));
                    }
                    (FolderWatch::Unavailable, None)
                }
                (true, _) if !state.enabled => {
                    if previous == Some(FolderWatch::Watching)
                        && let Some(watcher) = &mut state.watcher
                    {
                        watcher.unwatch(Path::new(&path));
                    }
                    (FolderWatch::Off, None)
                }
                (true, Some(FolderWatch::Watching | FolderWatch::Polling)) => {
                    let root = &state.roots[&path];
                    (root.watch, root.reason.clone())
                }
                (true, _) => match self.watch(&mut state, &path) {
                    Ok(()) => (FolderWatch::Watching, None),
                    Err(reason) => (FolderWatch::Polling, Some(reason)),
                },
            };
            let came_back = reachable && previous.is_none_or(|watch| watch == FolderWatch::Unavailable);
            let root = state.roots.entry(path.clone()).or_insert_with(|| Root {
                watch,
                reason: None,
                last_compared: Instant::now(),
            });
            changed |= previous != Some(watch) || root.reason != reason;
            root.watch = watch;
            root.reason = reason;
            let poll_due = watch == FolderWatch::Polling && root.last_compared.elapsed() >= self.timing.poll_interval;
            if came_back || poll_due {
                root.last_compared = Instant::now();
                due.push(path);
            }
        }
        (due, changed)
    }

    pub(super) fn watch(&self, state: &mut State, root: &str) -> Result<(), String> {
        if state.watcher.is_none() {
            let requests = self.requests.clone();
            let watcher = Watcher::new(self.timing.debounce, move |signal| {
                let _ = requests.send(match signal {
                    Signal::Changes(changes) => Request::Changes(changes),
                    Signal::Failed { paths, reason, limit } => Request::WatchFailed { paths, reason, limit },
                });
            })
            .map_err(|error| format!("Watching is not supported here: {error}"))?;
            state.watcher = Some(watcher);
        }
        match &mut state.watcher {
            Some(watcher) => watcher.watch(Path::new(root)),
            None => Err("Watching is not supported here".to_owned()),
        }
    }

    /// A watch broke: compare what it covered, and fall back to periodic comparisons when the limit was reached.
    pub(super) fn watch_failed(&self, paths: &[PathBuf], reason: String, limit: bool) -> Vec<Change> {
        let mut state = self.lock();
        let roots: Vec<String> = state
            .roots
            .keys()
            .filter(|root| paths.is_empty() || paths.iter().any(|path| is_within(path, Path::new(root))))
            .cloned()
            .collect();
        if limit {
            for root in &roots {
                if let Some(watcher) = &mut state.watcher {
                    watcher.unwatch(Path::new(root));
                }
                if let Some(entry) = state.roots.get_mut(root) {
                    entry.watch = FolderWatch::Polling;
                    entry.reason = Some(reason.clone());
                }
            }
            (self.notify)(SyncNotification::FoldersChanged);
        }
        roots
            .into_iter()
            .map(|root| Change::Rescan(Some(PathBuf::from(root))))
            .collect()
    }
}
