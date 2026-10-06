use tauri::State;

use crate::db::videos;
use crate::domain::models::{DailyWatchTotal, HistoryCursor, HistoryPage, Video};
use crate::error::{AppError, AppResult};
use crate::services::watch;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn get_video(state: State<'_, AppState>, path: String) -> AppResult<Option<Video>> {
    state
        .db
        .call(move |connection| videos::find_by_path(connection, &path))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn update_video_details(
    state: State<'_, AppState>,
    id: i64,
    title: String,
    description: String,
) -> AppResult<Video> {
    let title = title.trim().to_owned();
    if title.is_empty() {
        return Err(AppError::InvalidInput("title cannot be empty".into()));
    }
    state
        .db
        .call(move |connection| videos::update_details(connection, id, &title, &description))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn set_watched(state: State<'_, AppState>, id: i64, watched: bool) -> AppResult<Video> {
    watch::set_watched(&state.db, id, watched).await
}

/// Saves the playback position; `finished` is set when playback reached the end of the video.
#[tauri::command]
#[specta::specta]
pub async fn save_progress(
    state: State<'_, AppState>,
    id: i64,
    position_seconds: f64,
    finished: bool,
) -> AppResult<Video> {
    if !position_seconds.is_finite() {
        return Err(AppError::InvalidInput("position must be a finite number".into()));
    }
    watch::save_progress(&state.db, id, position_seconds, finished).await
}

/// Marks every video inside a folder as watched or unwatched. Returns how many changed.
#[tauri::command]
#[specta::specta]
pub async fn set_folder_watched(state: State<'_, AppState>, path: String, watched: bool) -> AppResult<i64> {
    watch::set_folder_watched(&state.db, path, watched).await
}

/// A page of the watch history (one entry per video per day), newest first. Pass the previous page's
/// `nextCursor` to get older entries.
#[tauri::command]
#[specta::specta]
pub async fn list_watch_history(
    state: State<'_, AppState>,
    cursor: Option<HistoryCursor>,
    limit: i64,
) -> AppResult<HistoryPage> {
    watch::history_page(&state.db, cursor, limit).await
}

/// Watched time per local day over the last `days` days (today included), oldest first; days without history are
/// left out.
#[tauri::command]
#[specta::specta]
pub async fn get_watch_totals(state: State<'_, AppState>, days: i64) -> AppResult<Vec<DailyWatchTotal>> {
    watch::daily_totals(&state.db, days).await
}

/// Clears the watch status of every video (tags are kept). Returns how many changed.
#[tauri::command]
#[specta::specta]
pub async fn reset_all_watch_status(state: State<'_, AppState>) -> AppResult<i64> {
    watch::reset_all(&state.db).await
}
