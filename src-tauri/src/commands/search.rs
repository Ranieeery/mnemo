use tauri::State;
use tauri::ipc::Channel;

use crate::domain::models::{SearchProgress, Video, VideoEntry};
use crate::error::AppResult;
use crate::services::search;
use crate::state::AppState;

/// Searches the library by title, description and tags.
#[tauri::command]
#[specta::specta]
pub async fn search_library(state: State<'_, AppState>, query: String, limit: i64) -> AppResult<Vec<Video>> {
    search::search_library(&state.db, query, limit.clamp(1, 500)).await
}

/// Searches file names below a folder on disk, streaming progress. A newer search cancels this one, which then
/// fails with the `cancelled` error kind.
#[tauri::command]
#[specta::specta]
pub async fn search_folder(
    state: State<'_, AppState>,
    path: String,
    query: String,
    on_progress: Channel<SearchProgress>,
) -> AppResult<Vec<VideoEntry>> {
    search::search_folder(&state.db, &state.search, path, query, move |progress| {
        if let Err(error) = on_progress.send(progress) {
            tracing::debug!(%error, "search progress channel closed");
        }
    })
    .await
}
