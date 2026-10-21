//! A library folder located at a new path, applied between two comparisons so none of them sees half of it.

use std::path::PathBuf;
use std::sync::Arc;

use super::Inner;
use crate::domain::relocation::RelocationResult;
use crate::error::AppResult;
use crate::services::media::{MediaToolkit, thumbnails};
use crate::services::relocation;

impl<T: MediaToolkit + 'static> Inner<T> {
    pub(super) async fn relocate(self: &Arc<Self>, from: String, to: String) -> AppResult<RelocationResult> {
        let removed_thumbnails = relocation::apply(&self.db, from, to.clone()).await?;
        let thumbnails_dir = self.thumbnails_dir.clone();
        tokio::task::spawn_blocking(move || thumbnails::delete(&thumbnails_dir, &removed_thumbnails)).await?;

        // The old path leaves the watched folders and the new one joins them, due for a comparison like any folder
        // that came back; folders due for other reasons are compared too, so none of them waits a turn.
        let mut due = self.refresh_roots().await;
        if !due.contains(&PathBuf::from(&to)) {
            due.push(PathBuf::from(&to));
        }
        self.compare(due, true).await;
        relocation::summary(&self.db, to).await
    }
}
