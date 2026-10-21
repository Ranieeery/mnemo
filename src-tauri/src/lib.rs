//! Mnemo backend: owns the database, the file system access and the media tools.

mod commands;
mod db;
mod domain;
mod error;
mod services;
mod state;

use std::fs::File;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, fmt};

use crate::error::{AppError, AppResult};
use crate::services::asset_scope;
use crate::state::AppState;

/// Written again at every start, in the app's log folder. Release builds have no console, so this file is the only
/// place their warnings end up.
const LOG_FILE: &str = "mnemo.log";

pub fn run() -> tauri::Result<()> {
    let bindings = commands::builder();
    let invoke_handler = bindings.invoke_handler();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            bindings.mount_events(app);
            let log_file = init_tracing(app.handle());
            if let Err(error) = start(app.handle()) {
                tracing::error!(%error, "Mnemo could not start");
                report_startup_failure(app.handle(), &error, log_file);
            }
            Ok(())
        })
        .invoke_handler(invoke_handler)
        .on_window_event(|window, event| {
            // Closing the main window ends background work (processing jobs, ffmpeg) with the app.
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
}

/// Opens the database and starts the background work.
fn start(app: &AppHandle) -> AppResult<()> {
    let state = AppState::initialize(
        app,
        commands::events::processing_notifier(app.clone()),
        commands::events::sync_notifier(app.clone()),
    )?;
    let library_folders = tauri::async_runtime::block_on(state.db.call(|connection| db::folders::paths(connection)))?;
    asset_scope::allow(app, &state.paths.thumbnails)?;
    asset_scope::allow_all(app, library_folders)?;
    tracing::info!(database = %state.paths.database.display(), "database ready");
    let sync = state.sync.clone();
    tauri::async_runtime::spawn(async move { sync.start() });
    app.manage(state);
    Ok(())
}

/// Without its state the window can't show anything, and a release build has no console: say why in a native dialog
/// instead, and quit once it is closed.
fn report_startup_failure(app: &AppHandle, error: &AppError, log_file: Option<PathBuf>) {
    for window in app.webview_windows().values() {
        if let Err(error) = window.hide() {
            tracing::warn!(%error, "could not hide the window");
        }
    }
    let details = log_file.map_or_else(String::new, |path| format!("\n\nDetails are in {}.", path.display()));
    let quit = app.clone();
    app.dialog()
        .message(format!("Mnemo could not open your library.\n\n{error}{details}"))
        .title("Mnemo")
        .kind(MessageDialogKind::Error)
        .show(move |_| quit.exit(1));
}

/// Logs to the console and to [`LOG_FILE`]; returns the file's path, unless it could not be created.
fn init_tracing(app: &AppHandle) -> Option<PathBuf> {
    let filter = EnvFilter::try_from_env("MNEMO_LOG").unwrap_or_else(|_| EnvFilter::new("mnemo_lib=info"));
    let (log_file, file_layer, failure) = match open_log_file(app) {
        Ok((path, file)) => {
            let layer = fmt::layer().with_ansi(false).with_writer(Mutex::new(file));
            (Some(path), Some(layer), None)
        }
        Err(error) => (None, None, Some(error)),
    };
    // A subscriber may already be installed (e.g. by tests); keeping the existing one is fine.
    let _ = tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer())
        .with(file_layer)
        .try_init();
    if let Some(error) = failure {
        tracing::warn!(%error, "could not create the log file; logging to the console only");
    }
    log_file
}

fn open_log_file(app: &AppHandle) -> AppResult<(PathBuf, File)> {
    let dir = app.path().app_log_dir()?;
    std::fs::create_dir_all(&dir).map_err(|error| AppError::io(&dir, error))?;
    let path = dir.join(LOG_FILE);
    let file = File::create(&path).map_err(|error| AppError::io(&path, error))?;
    Ok((path, file))
}
