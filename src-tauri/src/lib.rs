//! Mnemo backend: owns the database, the file system access and the media tools.

mod commands;
mod db;
mod domain;
mod error;
mod legacy;
mod services;
mod state;

use tauri::Manager;
use tracing_subscriber::EnvFilter;

use crate::services::asset_scope;
use crate::state::AppState;

pub fn run() -> tauri::Result<()> {
    init_tracing();

    let bindings = commands::builder();
    let typed_handler = bindings.invoke_handler();
    let legacy_handler = legacy::handler();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            let handle = app.handle();
            let state = AppState::initialize(handle)?;
            let library_folders =
                tauri::async_runtime::block_on(state.db.call(|connection| db::folders::paths(connection)))?;
            asset_scope::allow(handle, &state.paths.thumbnails)?;
            asset_scope::allow_all(handle, library_folders)?;
            tracing::info!(database = %state.paths.database.display(), "database ready");
            app.manage(state);
            Ok(())
        })
        .invoke_handler(move |invoke| {
            if legacy::COMMANDS.contains(&invoke.message.command()) {
                legacy_handler(invoke)
            } else {
                typed_handler(invoke)
            }
        })
        .on_window_event(|window, event| {
            // Closing the main window ends background work (processing jobs, ffmpeg) with the app.
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
}

fn init_tracing() {
    let filter = EnvFilter::try_from_env("MNEMO_LOG").unwrap_or_else(|_| EnvFilter::new("mnemo_lib=info"));
    // A subscriber may already be installed (e.g. by tests); keeping the existing one is fine.
    let _ = tracing_subscriber::fmt().with_env_filter(filter).try_init();
}
