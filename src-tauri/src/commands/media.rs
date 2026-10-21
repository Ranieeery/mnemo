use std::path::{Path, PathBuf};

use tauri::State;

use crate::db::folders;
use crate::domain::models::{MediaToolsStatus, MediaTracks, ProcessingStatus, SubtitleFile, Video};
use crate::domain::paths::is_within;
use crate::error::AppResult;
use crate::services::library::ensure_in_library;
use crate::services::media::processing::Priority;
use crate::services::{media, subtitles};
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn media_tools_status() -> MediaToolsStatus {
    media::tools_status().await
}

/// Brings each folder up to date with the disk (renamed, moved and vanished files), then queues its new videos to be
/// read in the background. Progress and the end of each job arrive as events; `report` asks for the job's summary to
/// be shown. Files still being copied are read by the sync once they settle. A folder already queued (or inside one)
/// adds its new files to that job. Returns the ids of the jobs reading the folders, matching the events of their ends.
/// Fails, queuing nothing, if any folder is outside the library or the comparison fails.
#[tauri::command]
#[specta::specta]
pub async fn process_folders(state: State<'_, AppState>, paths: Vec<String>, report: bool) -> AppResult<Vec<u64>> {
    let library = state.db.call(|connection| folders::paths(connection)).await?;
    for path in &paths {
        ensure_in_library(Path::new(path), &library)?;
    }
    let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    let new_files = state.sync.reconcile_now(paths.clone()).await?;
    let mut jobs: Vec<u64> = paths
        .into_iter()
        .map(|path| {
            let files = new_files
                .iter()
                .filter(|file| is_within(file, &path))
                .cloned()
                .collect();
            state.processor.enqueue(path, files, Priority::Normal, report)
        })
        .collect();
    jobs.sort_unstable();
    jobs.dedup();
    Ok(jobs)
}

/// Cancels reading the videos of one folder, or of every folder when `null`; running ffmpeg processes are killed.
#[tauri::command]
#[specta::specta]
pub fn cancel_processing(state: State<'_, AppState>, folder: Option<String>) {
    state.processor.cancel(folder.as_deref().map(Path::new));
}

/// What the processing pipeline is doing now, for screens that open while it runs.
#[tauri::command]
#[specta::specta]
pub fn get_processing_status(state: State<'_, AppState>) -> ProcessingStatus {
    state.processor.status()
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

/// A text subtitle stream of a library video (`index` among its subtitle streams), as ASS when it is ASS/SSA and as
/// WebVTT otherwise. Reads the whole file, so it can take a few seconds on large videos.
#[tauri::command]
#[specta::specta]
pub async fn extract_subtitle(state: State<'_, AppState>, path: String, index: i64) -> AppResult<SubtitleFile> {
    media::tracks::extract_subtitle(&state.db, &media::Ffmpeg, path, index).await
}

/// The external subtitle next to a library video, if any.
#[tauri::command]
#[specta::specta]
pub async fn find_subtitle(state: State<'_, AppState>, video_path: String) -> AppResult<Option<SubtitleFile>> {
    subtitles::find_for_video(&state.db, video_path).await
}
