use tauri::{AppHandle, State};

use crate::domain::folder_color::FolderColor;
use crate::domain::folder_order::LibraryFolderSort;
use crate::domain::folder_view::FolderViewMode;
use crate::domain::models::{
    FolderContents, FolderSummary, HiddenFolder, HomeData, LayoutEntry, LibraryEntry, LibraryFolder,
    LibraryFolderStatus, VideoEntry,
};
use crate::domain::relocation::{RelocationCheck, RelocationResult};
use crate::error::AppResult;
use crate::services::{asset_scope, folder_order, hidden, library, relocation};
use crate::state::AppState;

/// Every library folder in the order of the sidebar, a group's folders where the group is.
#[tauri::command]
#[specta::specta]
pub async fn list_library_folders(state: State<'_, AppState>) -> AppResult<Vec<LibraryFolder>> {
    folder_order::list_folders(&state.db).await
}

/// The library as the sidebar lists it: folders without a group and groups with their folders, in order.
#[tauri::command]
#[specta::specta]
pub async fn get_library_layout(state: State<'_, AppState>) -> AppResult<Vec<LibraryEntry>> {
    folder_order::layout(&state.db).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_library_folder_sort(state: State<'_, AppState>) -> AppResult<LibraryFolderSort> {
    folder_order::folder_sort(&state.db).await
}

/// Changes how the library is sorted. Returns it in the new order.
#[tauri::command]
#[specta::specta]
pub async fn set_library_folder_sort(
    state: State<'_, AppState>,
    sort: LibraryFolderSort,
) -> AppResult<Vec<LibraryEntry>> {
    folder_order::set_folder_sort(&state.db, sort).await
}

/// Puts folders and groups where they were moved to, in the order of `entries` (each group with its folders), and
/// switches to the custom order. What is left out stays where it was, after the rest (a folder at the end of its
/// group); unknown ids are ignored. Returns the library in the new order.
#[tauri::command]
#[specta::specta]
pub async fn arrange_library(state: State<'_, AppState>, entries: Vec<LayoutEntry>) -> AppResult<Vec<LibraryEntry>> {
    folder_order::arrange(&state.db, entries).await
}

/// Whether each library folder is reachable and how changes in it are followed. Empty until the first check, a few
/// seconds after startup.
#[tauri::command]
#[specta::specta]
pub fn get_library_folder_statuses(state: State<'_, AppState>) -> Vec<LibraryFolderStatus> {
    state.sync.statuses()
}

/// Adds a folder chosen in the native dialog and lets the webview load its files.
#[tauri::command]
#[specta::specta]
pub async fn add_library_folder(app: AppHandle, state: State<'_, AppState>, path: String) -> AppResult<LibraryFolder> {
    let folder = library::add_folder(&state.db, path).await?;
    asset_scope::allow_added(&app, [&folder.path]);
    state.sync.refresh();
    Ok(folder)
}

/// Removes a library folder with its videos and thumbnails. Returns how many videos were removed.
#[tauri::command]
#[specta::specta]
pub async fn remove_library_folder(state: State<'_, AppState>, path: String) -> AppResult<i64> {
    let removed = library::remove_folder(&state.db, &state.paths.thumbnails, path).await?;
    forget_removed_folders(&state).await;
    state.sync.refresh();
    Ok(removed)
}

/// Stops reading folders that left the library. Done after the change succeeded, so a refused one cancels nothing;
/// videos read meanwhile are not stored, as the writer only keeps videos inside library folders. A failure is only
/// logged, since the change is saved: the jobs left end without storing anything, for that same reason.
async fn forget_removed_folders(state: &AppState) {
    match library::folder_paths(&state.db).await {
        Ok(library) => state.processor.forget_outside(&library),
        Err(error) => tracing::warn!(%error, "could not stop reading the folders that left the library"),
    }
}

/// Compares the videos of an unreachable library folder with the files at `to`, without changing anything. Fails
/// when `to` cannot be its new location (not a folder, already in the library, containing a library folder).
#[tauri::command]
#[specta::specta]
pub async fn check_folder_relocation(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> AppResult<RelocationCheck> {
    relocation::check(&state.db, from, to).await
}

/// Points an unreachable library folder at `to`, keeping every video's data, and compares it with the disk.
/// Files are never moved.
#[tauri::command]
#[specta::specta]
pub async fn relocate_library_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> AppResult<RelocationResult> {
    let result = state.sync.relocate(from, to).await?;
    forget_removed_folders(&state).await;
    asset_scope::allow_added(&app, [&result.folder.path]);
    Ok(result)
}

/// Sets a library folder's icon and its color; `null` restores each default.
#[tauri::command]
#[specta::specta]
pub async fn set_library_folder_appearance(
    state: State<'_, AppState>,
    path: String,
    icon: Option<String>,
    color: Option<FolderColor>,
) -> AppResult<()> {
    library::set_folder_appearance(&state.db, path, icon, color).await
}

/// Renames a library folder in the app only (the folder on disk keeps its name). An empty or missing `name`, or the
/// folder's own name, shows the folder's own name again. Returns the folder as it is now.
#[tauri::command]
#[specta::specta]
pub async fn rename_library_folder(
    state: State<'_, AppState>,
    path: String,
    name: Option<String>,
) -> AppResult<LibraryFolder> {
    library::rename_folder(&state.db, path, name).await
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
    library::home(&state.db, limit).await
}

/// The folders hidden from the home page and the history.
#[tauri::command]
#[specta::specta]
pub async fn list_hidden_folders(state: State<'_, AppState>) -> AppResult<Vec<HiddenFolder>> {
    hidden::list(&state.db).await
}

/// Hides a folder inside the library (and everything in it) from the home page and the history, or shows it again.
/// Its videos stay in the library and are shown normally when browsing it.
#[tauri::command]
#[specta::specta]
pub async fn set_folder_hidden(state: State<'_, AppState>, path: String, hidden: bool) -> AppResult<()> {
    hidden::set_hidden(&state.db, path, hidden).await
}
