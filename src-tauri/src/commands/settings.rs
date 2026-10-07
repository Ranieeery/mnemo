use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::domain::models::{AppSettings, DatabaseInfo, ImportSummary, LibraryStats, PlayerPreferences, Video};
use crate::domain::shortcuts::KeyboardShortcuts;
use crate::domain::subtitle_style::SubtitleStyle;
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
    let saved = watch::update_settings(&state.db, settings).await?;
    state.sync.set_enabled(saved.watch_folders);
    Ok(saved)
}

/// Volume, speed, subtitles and layout of the player, as it was last left.
#[tauri::command]
#[specta::specta]
pub async fn get_player_preferences(state: State<'_, AppState>) -> AppResult<PlayerPreferences> {
    watch::player_preferences(&state.db).await
}

#[tauri::command]
#[specta::specta]
pub async fn update_player_preferences(
    state: State<'_, AppState>,
    preferences: PlayerPreferences,
) -> AppResult<PlayerPreferences> {
    watch::update_player_preferences(&state.db, preferences).await
}

/// The keys of every configurable action, with defaults filling anything not customized.
#[tauri::command]
#[specta::specta]
pub async fn get_keyboard_shortcuts(state: State<'_, AppState>) -> AppResult<KeyboardShortcuts> {
    watch::keyboard_shortcuts(&state.db).await
}

/// Stores the keyboard shortcuts; rejects malformed, reserved or repeated keys and more than two keys per action.
#[tauri::command]
#[specta::specta]
pub async fn update_keyboard_shortcuts(
    state: State<'_, AppState>,
    shortcuts: KeyboardShortcuts,
) -> AppResult<KeyboardShortcuts> {
    watch::update_keyboard_shortcuts(&state.db, shortcuts).await
}

/// How subtitles look in the player.
#[tauri::command]
#[specta::specta]
pub async fn get_subtitle_style(state: State<'_, AppState>) -> AppResult<SubtitleStyle> {
    watch::subtitle_style(&state.db).await
}

/// Stores how subtitles look; rejects sizes, opacities and positions out of range.
#[tauri::command]
#[specta::specta]
pub async fn update_subtitle_style(state: State<'_, AppState>, style: SubtitleStyle) -> AppResult<SubtitleStyle> {
    watch::update_subtitle_style(&state.db, style).await
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

/// Videos whose file disappeared from a library folder; they keep their data until cleaned or found again.
#[tauri::command]
#[specta::specta]
pub async fn list_missing_videos(state: State<'_, AppState>) -> AppResult<Vec<Video>> {
    maintenance::missing_videos(&state.db).await
}

#[tauri::command]
#[specta::specta]
pub async fn clean_missing_videos(state: State<'_, AppState>) -> AppResult<i64> {
    maintenance::clean_missing_videos(&state.db, &state.paths.thumbnails).await
}
