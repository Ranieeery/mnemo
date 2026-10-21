//! Brings the library up to date with what changed below some paths: renames first, then a comparison with the disk.

use std::path::{Path, PathBuf};

use super::disk::{outermost, root_of};
use super::reconcile::reconcile;
use super::watch::Change;
use super::{Inner, Request, SyncNotification};
use crate::db::{folders, hidden, presence};
use crate::domain::media::is_video_path;
use crate::domain::paths::is_within;
use crate::error::AppResult;
use crate::services::media::MediaToolkit;
use crate::services::media::processing::Priority;

impl<T: MediaToolkit + 'static> Inner<T> {
    /// Applies the renames the watcher paired (so videos never fingerprinted keep their record too) and returns
    /// every path to compare.
    pub(super) async fn follow_renames(&self, changes: Vec<Change>) -> Vec<PathBuf> {
        let reachable = self.reachable_roots();
        let mut paths = Vec::new();
        let mut renames = Vec::new();
        for change in changes {
            match change {
                Change::Renamed { from, to } => {
                    renames.push((from.clone(), to.clone()));
                    paths.extend([from, to]);
                }
                Change::Touched(path) | Change::Rescan(Some(path)) => paths.push(path),
                Change::Rescan(None) => paths.extend(reachable.iter().map(PathBuf::from)),
            }
        }
        if !renames.is_empty() {
            let followed = self
                .db
                .call(move |connection| {
                    let library = folders::paths(connection)?;
                    let transaction = connection.transaction()?;
                    for (from, to) in renames {
                        if root_of(&from, &library).is_none() || root_of(&to, &library).is_none() {
                            continue;
                        }
                        let (from, to) = (from.to_string_lossy(), to.to_string_lossy());
                        if Path::new(to.as_ref()).is_dir() {
                            presence::move_folder(&transaction, &from, &to)?;
                            folders::move_view_modes(&transaction, &from, &to)?;
                            hidden::move_within(&transaction, &from, &to)?;
                        } else if is_video_path(Path::new(to.as_ref())) {
                            presence::rename_file(&transaction, &from, &to)?;
                        }
                    }
                    transaction.commit()?;
                    Ok(())
                })
                .await;
            if let Err(error) = followed {
                tracing::warn!(%error, "failed to follow renamed files");
            }
        }
        paths
    }

    /// Compares `paths` with the disk, logging a failure (see [`Self::try_compare`]).
    pub(super) async fn compare(&self, paths: Vec<PathBuf>, read_new: bool) {
        if let Err(error) = self.try_compare(paths, read_new).await {
            tracing::warn!(%error, "failed to compare library folders with the disk");
        }
    }

    /// Compares `paths` with the disk. With `read_new`, new files go to the pipeline (once they stopped growing)
    /// and the app is told the library changed.
    pub(super) async fn try_compare(&self, paths: Vec<PathBuf>, read_new: bool) -> AppResult<()> {
        if paths.is_empty() {
            return Ok(());
        }
        let reconciled = reconcile(&self.db, paths, self.timing.settle).await?;
        if !reconciled.deferred.is_empty() {
            let requests = self.requests.clone();
            let retry_delay = self.timing.retry_delay;
            let deferred = reconciled.deferred;
            tokio::spawn(async move {
                tokio::time::sleep(retry_delay).await;
                let _ = requests.send(Request::Changes(deferred.into_iter().map(Change::Touched).collect()));
            });
        }
        if read_new {
            let parents = reconciled
                .new_files
                .iter()
                .filter_map(|file| file.parent().map(Path::to_path_buf));
            for folder in outermost(parents.collect()) {
                let files = reconciled
                    .new_files
                    .iter()
                    .filter(|file| is_within(file, &folder))
                    .cloned()
                    .collect();
                self.processor.enqueue_files(folder, files, Priority::Normal);
            }
            (self.notify)(SyncNotification::LibraryChanged);
        } else if reconciled.changed {
            (self.notify)(SyncNotification::LibraryChanged);
        }
        Ok(())
    }
}
