//! Work done once the startup comparison is over: deleting videos missing for too long and fingerprinting the videos
//! stored before 2.3.

use std::path::Path;
use std::sync::Arc;

use super::{Inner, identity};
use crate::db::presence;
use crate::domain::models::FolderWatch;
use crate::error::AppResult;
use crate::services::media::MediaToolkit;
use crate::services::media::thumbnails;

/// Missing videos are deleted once missing for this long, at startup.
const MISSING_KEPT_DAYS: i64 = 30;
/// Videos fingerprinted per database round trip by the backfill.
const BACKFILL_BATCH: i64 = 50;

impl<T: MediaToolkit + 'static> Inner<T> {
    /// Deletes the videos missing for too long below reachable library folders, with their thumbnails.
    pub(super) async fn delete_old_missing(&self) {
        let reachable: Vec<String> = self
            .lock()
            .roots
            .iter()
            .filter(|(_, root)| root.watch != FolderWatch::Unavailable)
            .map(|(path, _)| path.clone())
            .collect();
        let deleted = self
            .db
            .call(move |connection| presence::delete_missing(connection, &reachable, Some(MISSING_KEPT_DAYS)))
            .await;
        match deleted {
            Ok((_, thumbnails)) => {
                let thumbnails_dir = self.thumbnails_dir.clone();
                let _ = tokio::task::spawn_blocking(move || thumbnails::delete(&thumbnails_dir, &thumbnails)).await;
            }
            Err(error) => tracing::warn!(%error, "failed to delete videos missing for long"),
        }
    }

    /// Fingerprints the videos stored before 2.3, one file at a time and only while the pipeline is idle. Files that
    /// cannot be read now are retried at the next start.
    pub(super) async fn backfill(self: Arc<Self>) -> AppResult<()> {
        let mut after_id = 0;
        loop {
            let batch = self
                .db
                .call(move |connection| presence::without_fingerprint(connection, after_id, BACKFILL_BATCH))
                .await?;
            if batch.is_empty() {
                return Ok(());
            }
            for (id, path) in batch {
                after_id = id;
                while !self.processor.status().jobs.is_empty() {
                    tokio::time::sleep(self.timing.idle_check).await;
                }
                if let Ok(Ok(identity)) =
                    tokio::task::spawn_blocking(move || identity::identify(Path::new(&path))).await
                {
                    self.db
                        .call(move |connection| presence::set_identity(connection, id, &identity))
                        .await?;
                }
            }
        }
    }
}
