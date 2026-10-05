use tauri::State;

use crate::error::AppResult;
use crate::services::system;
use crate::state::AppState;

/// Opens a library file with the system's default application.
#[tauri::command]
#[specta::specta]
pub async fn open_externally(state: State<'_, AppState>, path: String) -> AppResult<()> {
    system::open_externally(&state.db, path).await
}

/// Shows a library file selected in the system file manager.
#[tauri::command]
#[specta::specta]
pub async fn reveal_in_file_manager(state: State<'_, AppState>, path: String) -> AppResult<()> {
    system::reveal_in_file_manager(&state.db, path).await
}
