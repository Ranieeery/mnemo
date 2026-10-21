//! The library folders the sync keeps track of: which are reachable, and how each is watched.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use super::watch::{Change, Signal, Watcher};
use super::{Inner, Request, Root, SyncNotification};
use crate::db::folders;
use crate::domain::models::FolderWatch;
use crate::domain::paths::is_within;
use crate::services::media::MediaToolkit;

impl<T: MediaToolkit + 'static> Inner<T> {
    /// Brings the folder list up to date: checks which folders are reachable and (un)watches them. Returns the
    /// folders to compare now: added, reachable again, watched again, or due for their periodic comparison.
    pub(super) async fn refresh_roots(self: &Arc<Self>) -> Vec<PathBuf> {
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

    /// The library folders that were reachable at the last check.
    pub(super) fn reachable_roots(&self) -> Vec<String> {
        self.lock()
            .roots
            .iter()
            .filter(|(_, root)| root.watch != FolderWatch::Unavailable)
            .map(|(path, _)| path.clone())
            .collect()
    }

    fn refresh_roots_blocking(&self, library: Vec<String>) -> (Vec<PathBuf>, bool) {
        let reachable: Vec<(String, bool)> = library
            .into_iter()
            .map(|root| {
                let reachable = Path::new(&root).is_dir();
                (root, reachable)
            })
            .collect();
        // Only the loop changes the roots, so they can be read here and written back once the watches are in place,
        // without holding the state meanwhile.
        let (enabled, previous): (bool, BTreeMap<String, (FolderWatch, Option<String>)>) = {
            let state = self.lock();
            let previous = state
                .roots
                .iter()
                .map(|(path, root)| (path.clone(), (root.watch, root.reason.clone())))
                .collect();
            (state.enabled, previous)
        };

        let decided: Vec<(String, FolderWatch, Option<String>)> = {
            let mut watcher = self.watcher();
            for (root, (watch, _)) in &previous {
                if *watch == FolderWatch::Watching && !reachable.iter().any(|(path, _)| path == root) {
                    unwatch(&mut watcher, root);
                }
            }
            reachable
                .into_iter()
                .map(|(path, reachable)| {
                    let (watch, reason) = match (reachable, previous.get(&path)) {
                        (true, Some((watch @ (FolderWatch::Watching | FolderWatch::Polling), reason))) if enabled => {
                            (*watch, reason.clone())
                        }
                        (true, _) if enabled => match self.watch(&mut watcher, &path) {
                            Ok(()) => (FolderWatch::Watching, None),
                            Err(reason) => (FolderWatch::Polling, Some(reason)),
                        },
                        (reachable, previous) => {
                            if previous.is_some_and(|(watch, _)| *watch == FolderWatch::Watching) {
                                unwatch(&mut watcher, &path);
                            }
                            let watch = if reachable {
                                FolderWatch::Off
                            } else {
                                FolderWatch::Unavailable
                            };
                            (watch, None)
                        }
                    };
                    (path, watch, reason)
                })
                .collect()
        };

        let mut state = self.lock();
        state
            .roots
            .retain(|root, _| decided.iter().any(|(path, _, _)| path == root));
        let mut changed = state.roots.len() != previous.len();
        let mut due = Vec::new();
        for (path, watch, reason) in decided {
            let previous = previous.get(&path).map(|(watch, _)| *watch);
            // What changed while the folder was unknown, unreachable or not watched went unseen.
            let unseen = match previous {
                None | Some(FolderWatch::Unavailable) => watch != FolderWatch::Unavailable,
                Some(FolderWatch::Off) => matches!(watch, FolderWatch::Watching | FolderWatch::Polling),
                Some(FolderWatch::Watching | FolderWatch::Polling) => false,
            };
            let root = state.roots.entry(path.clone()).or_insert_with(|| Root {
                watch,
                reason: None,
                last_compared: Instant::now(),
            });
            changed |= previous != Some(watch) || root.reason != reason;
            root.watch = watch;
            root.reason = reason;
            let poll_due = watch == FolderWatch::Polling && root.last_compared.elapsed() >= self.timing.poll_interval;
            if unseen || poll_due {
                root.last_compared = Instant::now();
                due.push(PathBuf::from(path));
            }
        }
        (due, changed)
    }

    fn watch(&self, watcher: &mut Option<Watcher>, root: &str) -> Result<(), String> {
        let created = match watcher.take() {
            Some(watcher) => watcher,
            None => {
                let requests = self.requests.clone();
                Watcher::new(self.timing.debounce, move |signal| {
                    let _ = requests.send(match signal {
                        Signal::Changes(changes) => Request::Changes(changes),
                        Signal::Failed { paths, reason, limit } => Request::WatchFailed { paths, reason, limit },
                    });
                })
                .map_err(|error| format!("Watching is not supported here: {error}"))?
            }
        };
        watcher.insert(created).watch(Path::new(root))
    }

    /// A watch broke: compare what it covered (every watched folder when `paths` is empty), and fall back to periodic
    /// comparisons when the limit was reached.
    pub(super) fn watch_failed(&self, paths: &[PathBuf], reason: String, limit: bool) -> Vec<Change> {
        let roots: Vec<String> = self
            .lock()
            .roots
            .iter()
            .filter(|(root, entry)| {
                entry.watch == FolderWatch::Watching
                    && (paths.is_empty() || paths.iter().any(|path| is_within(path, Path::new(root))))
            })
            .map(|(root, _)| root.clone())
            .collect();
        if limit && !roots.is_empty() {
            let mut watcher = self.watcher();
            for root in &roots {
                unwatch(&mut watcher, root);
            }
            drop(watcher);
            let mut state = self.lock();
            for root in &roots {
                if let Some(entry) = state.roots.get_mut(root) {
                    entry.watch = FolderWatch::Polling;
                    entry.reason = Some(reason.clone());
                }
            }
            drop(state);
            (self.notify)(SyncNotification::FoldersChanged);
        }
        roots
            .into_iter()
            .map(|root| Change::Rescan(Some(PathBuf::from(root))))
            .collect()
    }
}

fn unwatch(watcher: &mut Option<Watcher>, root: &str) {
    if let Some(watcher) = watcher {
        watcher.unwatch(Path::new(root));
    }
}
