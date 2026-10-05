use std::path::Path;

use tauri::State;
use tauri::ipc::Channel;

use crate::domain::models::{MediaToolsStatus, ProcessingEvent, ProcessingSummary, SubtitleFile};
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

/// The external subtitle next to a video, if any.
#[tauri::command]
#[specta::specta]
pub async fn find_subtitle(video_path: String) -> AppResult<Option<SubtitleFile>> {
    tokio::task::spawn_blocking(move || subtitles::find_for(Path::new(&video_path))).await?
}
