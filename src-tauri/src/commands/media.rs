use std::path::Path;

use tauri::State;
use tauri::ipc::Channel;

use crate::domain::models::{MediaToolsStatus, MediaTracks, ProcessingEvent, ProcessingSummary, SubtitleFile, Video};
use crate::error::AppResult;
use crate::services::{media, subtitles};
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn media_tools_status() -> MediaToolsStatus {
    media::tools_status().await
}

/// Extracts metadata and thumbnails for the new videos below a folder, streaming progress. Jobs run one at a time;
/// a second request waits for the first.
#[tauri::command]
#[specta::specta]
pub async fn process_folder(
    state: State<'_, AppState>,
    path: String,
    on_event: Channel<ProcessingEvent>,
) -> AppResult<ProcessingSummary> {
    let _job = state.processing.lock().await;
    media::pipeline::process_folder(
        &state.db,
        &media::Ffmpeg,
        &state.paths.thumbnails,
        Path::new(&path),
        |event| {
            if let Err(error) = on_event.send(event) {
                tracing::debug!(%error, "processing progress channel closed");
            }
        },
    )
    .await
}

/// Makes the frame at `position_seconds` the video's thumbnail, or restores the automatic one when `null`.
#[tauri::command]
#[specta::specta]
pub async fn set_video_thumbnail(
    state: State<'_, AppState>,
    id: i64,
    position_seconds: Option<f64>,
) -> AppResult<Video> {
    media::cover::set_video_thumbnail(&state.db, &media::Ffmpeg, &state.paths.thumbnails, id, position_seconds).await
}

/// The audio and subtitle streams inside a library video.
#[tauri::command]
#[specta::specta]
pub async fn list_media_tracks(state: State<'_, AppState>, path: String) -> AppResult<MediaTracks> {
    media::tracks::list_tracks(&state.db, &media::Ffmpeg, path).await
}

/// A text subtitle stream of a library video (`index` among its subtitle streams), converted to WebVTT. Reads the
/// whole file, so it can take a few seconds on large videos.
#[tauri::command]
#[specta::specta]
pub async fn extract_subtitle(state: State<'_, AppState>, path: String, index: i64) -> AppResult<SubtitleFile> {
    media::tracks::extract_subtitle(&state.db, &media::Ffmpeg, path, index).await
}

/// The external subtitle next to a video, if any.
#[tauri::command]
#[specta::specta]
pub async fn find_subtitle(video_path: String) -> AppResult<Option<SubtitleFile>> {
    tokio::task::spawn_blocking(move || subtitles::find_for(Path::new(&video_path))).await?
}
