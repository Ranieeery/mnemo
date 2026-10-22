use tauri::{Manager, State, Window, WindowEvent};
use tauri_specta::Event;

use super::events::WindowModeChanged;
use crate::domain::window::{Size, WindowMode, aspect_or_default};
use crate::error::AppResult;
use crate::services::window::WindowControl;

/// Tells every listener about a mode change (the window may also change it on its own, see `lib.rs`).
pub fn announce(window: &Window, mode: AppResult<WindowMode>) -> AppResult<WindowMode> {
    if let Ok(mode) = mode
        && let Err(error) = WindowModeChanged(mode).emit(window)
    {
        tracing::warn!(%error, "failed to send the window mode");
    }
    mode
}

/// The aspect ratio of a video from its size in pixels; unknown sizes (`None`, zero) give 16:9.
fn aspect(width: Option<f64>, height: Option<f64>) -> f64 {
    aspect_or_default(width.unwrap_or(0.0), height.unwrap_or(0.0))
}

/// Follows what the user does to the window itself: resizing or maximizing the mini player, or moving it to a
/// monitor with another scale.
pub fn follow_window_event(window: &Window, event: &WindowEvent) {
    let Some(control) = window.try_state::<WindowControl>() else {
        return;
    };
    match event {
        WindowEvent::Resized(size) => {
            let size = Size {
                width: size.width,
                height: size.height,
            };
            if control.note_resize(size) {
                // Window calls from inside its own event would run in the middle of it: settle it afterwards.
                let window = window.clone();
                tauri::async_runtime::spawn_blocking(move || settle_resize(&window));
            }
        }
        WindowEvent::ScaleFactorChanged { scale_factor, .. } => control.note_scale(*scale_factor),
        _ => {}
    }
}

fn settle_resize(window: &Window) {
    let Some(control) = window.try_state::<WindowControl>() else {
        return;
    };
    match control.settle_resize(window) {
        Ok(Some(mode)) => {
            let _ = announce(window, Ok(mode));
        }
        Ok(None) => {}
        Err(error) => tracing::warn!(%error, "could not follow a resize of the mini player"),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_window_mode(control: State<'_, WindowControl>) -> AppResult<WindowMode> {
    control.mode()
}

/// Keeps the window above other windows, or stops. Not remembered between sessions.
#[tauri::command]
#[specta::specta]
pub async fn set_window_pinned(
    window: Window,
    control: State<'_, WindowControl>,
    pinned: bool,
) -> AppResult<WindowMode> {
    announce(&window, control.set_pinned(&window, pinned))
}

/// Shrinks the window to the mini player for a video of the given size, in pixels.
#[tauri::command]
#[specta::specta]
pub async fn enter_mini_player(
    window: Window,
    control: State<'_, WindowControl>,
    video_width: Option<f64>,
    video_height: Option<f64>,
) -> AppResult<WindowMode> {
    announce(&window, control.enter_mini(&window, aspect(video_width, video_height)))
}

/// Gives the window back the size, position and state it had before the mini player.
#[tauri::command]
#[specta::specta]
pub async fn exit_mini_player(window: Window, control: State<'_, WindowControl>) -> AppResult<WindowMode> {
    announce(&window, control.exit_mini(&window))
}

/// Fits the mini player to the video now playing.
#[tauri::command]
#[specta::specta]
pub async fn set_mini_player_aspect(
    window: Window,
    control: State<'_, WindowControl>,
    video_width: Option<f64>,
    video_height: Option<f64>,
) -> AppResult<WindowMode> {
    control.set_mini_aspect(&window, aspect(video_width, video_height))
}
