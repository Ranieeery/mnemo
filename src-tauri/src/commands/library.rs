use tauri::{AppHandle, State};

use crate::domain::folder_view::FolderViewMode;
use crate::domain::models::{FolderContents, FolderSummary, HomeData, LibraryFolder, VideoEntry};
use crate::error::AppResult;
use crate::services::{asset_scope, library};
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn list_library_folders(state: State<'_, AppState>) -> AppResult<Vec<LibraryFolder>> {
    state.db.call(|connection| crate::db::folders::list(connection)).await
}

/// Adds a folder chosen in the native dialog and lets the webview load its files.
#[tauri::command]
#[specta::specta]
pub async fn add_library_folder(app: AppHandle, state: State<'_, AppState>, path: String) -> AppResult<LibraryFolder> {
    let folder = library::add_folder(&state.db, path).await?;
    asset_scope::allow(&app, &folder.path)?;
    Ok(folder)
}

/// Removes a library folder with its videos and thumbnails. Returns how many videos were removed.
#[tauri::command]
#[specta::specta]
pub async fn remove_library_folder(state: State<'_, AppState>, path: String) -> AppResult<i64> {
    library::remove_folder(&state.db, &state.paths.thumbnails, path).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_library_folder_icon(state: State<'_, AppState>, path: String, icon: Option<String>) -> AppResult<()> {
    library::set_folder_icon(&state.db, path, icon).await
}

/// Folder icons chosen most recently, newest first, offered first by the icon picker.
#[tauri::command]
#[specta::specta]
pub async fn recent_folder_icons(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    library::recent_folder_icons(&state.db).await
}

/// Sets how a folder lists its videos; `None` makes it inherit from its parent again.
#[tauri::command]
#[specta::specta]
pub async fn set_folder_view_mode(
    state: State<'_, AppState>,
    path: String,
    mode: Option<FolderViewMode>,
) -> AppResult<()> {
    library::set_view_mode(&state.db, path, mode).await
}

#[tauri::command]
#[specta::specta]
pub async fn browse_folder(state: State<'_, AppState>, path: String) -> AppResult<FolderContents> {
    library::browse_folder(&state.db, path).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_folder_summary(state: State<'_, AppState>, path: String) -> AppResult<FolderSummary> {
    library::folder_summary(&state.db, path).await
}

/// The ordered list of videos that plays around `video_path` (its folder, or the continuous tree).
#[tauri::command]
#[specta::specta]
pub async fn list_playlist(state: State<'_, AppState>, video_path: String) -> AppResult<Vec<VideoEntry>> {
    library::playlist(&state.db, video_path).await
}

/// Home page sections, each limited to `limit` videos.
#[tauri::command]
#[specta::specta]
pub async fn get_home(state: State<'_, AppState>, limit: i64) -> AppResult<HomeData> {
    library::home(&state.db, limit.clamp(1, 50)).await
}
