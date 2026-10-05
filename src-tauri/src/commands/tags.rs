use tauri::State;

use crate::domain::models::{Tag, TagWithUsage};
use crate::error::AppResult;
use crate::services::tags;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn list_tags(state: State<'_, AppState>) -> AppResult<Vec<TagWithUsage>> {
    tags::list(&state.db).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_video_tags(state: State<'_, AppState>, video_id: i64) -> AppResult<Vec<Tag>> {
    tags::for_video(&state.db, video_id).await
}

/// Adds a tag (normalized, created on demand) and returns the video's tags.
#[tauri::command]
#[specta::specta]
pub async fn add_tag_to_video(state: State<'_, AppState>, video_id: i64, name: String) -> AppResult<Vec<Tag>> {
    tags::add_to_video(&state.db, video_id, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn remove_tag_from_video(state: State<'_, AppState>, video_id: i64, tag_id: i64) -> AppResult<Vec<Tag>> {
    tags::remove_from_video(&state.db, video_id, tag_id).await
}

/// Tags every video inside a folder. Returns how many videos received the tag.
#[tauri::command]
#[specta::specta]
pub async fn add_tag_to_folder(state: State<'_, AppState>, path: String, name: String) -> AppResult<i64> {
    tags::add_to_folder(&state.db, path, name).await
}

/// Removes every tag from the videos inside a folder. Returns how many assignments were removed.
#[tauri::command]
#[specta::specta]
pub async fn remove_all_tags_from_folder(state: State<'_, AppState>, path: String) -> AppResult<i64> {
    tags::remove_all_from_folder(&state.db, path).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_tag(state: State<'_, AppState>, tag_id: i64) -> AppResult<()> {
    tags::delete(&state.db, tag_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn remove_tag_from_all_videos(state: State<'_, AppState>, tag_id: i64) -> AppResult<i64> {
    tags::remove_from_all_videos(&state.db, tag_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_all_tags(state: State<'_, AppState>) -> AppResult<i64> {
    tags::delete_all(&state.db).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_unused_tags(state: State<'_, AppState>) -> AppResult<i64> {
    tags::delete_unused(&state.db).await
}
