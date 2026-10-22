use tauri::State;

use crate::domain::updates::{UpdateCheck, UpdateStatus};
use crate::error::AppResult;
use crate::services::updates::now_ms;
use crate::state::AppState;

/// Whether updates are checked automatically, when the last check got an answer and the newer version it found.
#[tauri::command]
#[specta::specta]
pub async fn get_update_status(state: State<'_, AppState>) -> AppResult<UpdateStatus> {
    state.updates.status().await
}

#[tauri::command]
#[specta::specta]
pub async fn set_automatic_update_checks(state: State<'_, AppState>, enabled: bool) -> AppResult<UpdateStatus> {
    state.updates.set_automatic(enabled).await
}

/// Asks GitHub for the latest published release now. The automatic check runs on its own at startup.
#[tauri::command]
#[specta::specta]
pub async fn check_for_updates(state: State<'_, AppState>) -> AppResult<UpdateCheck> {
    state.updates.check_now(now_ms()).await
}

/// Opens the newer release's page in the default browser. The URL is built in the backend, never passed in.
#[tauri::command]
#[specta::specta]
pub async fn open_release_page(state: State<'_, AppState>) -> AppResult<()> {
    state.updates.open_release_page().await
}
