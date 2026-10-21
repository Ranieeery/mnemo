//! A library file imported between two comparisons, so none of them works from the replaced library.

use std::path::PathBuf;
use std::sync::Arc;

use super::{Inner, SyncNotification};
use crate::db::backup::{self, LibraryFile};
use crate::db::{folders, settings};
use crate::domain::models::ImportSummary;
use crate::error::AppResult;
use crate::services::media::MediaToolkit;

impl<T: MediaToolkit + 'static> Inner<T> {
    pub(super) async fn import(self: &Arc<Self>, file: LibraryFile) -> AppResult<ImportSummary> {
        let (summary, library, watch_folders) = self
            .db
            .call(move |connection| {
                let summary = backup::import(connection, &file)?;
                let library = folders::paths(connection)?;
                let watch_folders = settings::get::<settings::WatchFolders>(connection)?;
                Ok((summary, library, watch_folders))
            })
            .await?;

        // Only after the import succeeded: a refused file leaves the reading of the current folders alone.
        self.processor.forget_outside(&library);
        self.lock().enabled = watch_folders;
        self.refresh_roots().await;
        // Every imported folder is compared like at startup: files renamed or moved since the export keep their
        // videos, and new files are read.
        let reachable = self.reachable_roots().into_iter().map(PathBuf::from).collect();
        self.compare(reachable).await;
        (self.notify)(SyncNotification::LibraryChanged);
        Ok(summary)
    }
}
