use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::domain::models::{AppSettings, DatabaseInfo, ImportSummary, LibraryStats, Video};
use crate::error::AppResult;
use crate::services::{asset_scope, backup, maintenance, watch};
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn get_settings(state: State<'_, AppState>) -> AppResult<AppSettings> {
    watch::get_settings(&state.db).await
}

#[tauri::command]
#[specta::specta]
pub async fn update_settings(state: State<'_, AppState>, settings: AppSettings) -> AppResult<AppSettings> {
    watch::update_settings(&state.db, settings).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_library_stats(state: State<'_, AppState>) -> AppResult<LibraryStats> {
    maintenance::library_stats(&state.db).await
}

/// Writes the whole library to a JSON file chosen in the native save dialog.
#[tauri::command]
#[specta::specta]
pub async fn export_library(state: State<'_, AppState>, path: String) -> AppResult<()> {
    backup::export_to_file(&state.db, PathBuf::from(path)).await
}

/// Replaces the library with a JSON export (current or legacy format). All or nothing.
#[tauri::command]
#[specta::specta]
pub async fn import_library(app: AppHandle, state: State<'_, AppState>, path: String) -> AppResult<ImportSummary> {
    let summary = backup::import_from_file(&state.db, PathBuf::from(path)).await?;
    let folders = state
        .db
        .call(|connection| crate::db::folders::paths(connection))
        .await?;
    asset_scope::allow_all(&app, folders)?;
    Ok(summary)
}

#[tauri::command]
#[specta::specta]
pub async fn get_database_info(state: State<'_, AppState>) -> AppResult<DatabaseInfo> {
    maintenance::database_info(&state.db, state.paths.database.clone()).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_orphaned_videos(state: State<'_, AppState>) -> AppResult<Vec<Video>> {
    maintenance::orphaned_videos(&state.db).await
}

#[tauri::command]
#[specta::specta]
pub async fn clean_orphaned_videos(state: State<'_, AppState>) -> AppResult<i64> {
    maintenance::clean_orphaned_videos(&state.db, &state.paths.thumbnails).await
}
