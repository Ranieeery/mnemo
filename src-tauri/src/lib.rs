//! Mnemo backend: owns the database, the file system access and the media tools.

mod commands;
mod db;
mod domain;
mod error;
mod services;
mod state;

use tauri::Manager;
use tracing_subscriber::EnvFilter;

use crate::services::asset_scope;
use crate::state::AppState;

pub fn run() -> tauri::Result<()> {
    init_tracing();

    let bindings = commands::builder();
    let invoke_handler = bindings.invoke_handler();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            bindings.mount_events(app);
            let handle = app.handle();
            let state = AppState::initialize(
                handle,
                commands::events::processing_notifier(handle.clone()),
                commands::events::sync_notifier(handle.clone()),
            )?;
            let library_folders =
                tauri::async_runtime::block_on(state.db.call(|connection| db::folders::paths(connection)))?;
            asset_scope::allow(handle, &state.paths.thumbnails)?;
            asset_scope::allow_all(handle, library_folders)?;
            tracing::info!(database = %state.paths.database.display(), "database ready");
            let sync = state.sync.clone();
            tauri::async_runtime::spawn(async move { sync.start() });
            app.manage(state);
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

fn init_tracing() {
    let filter = EnvFilter::try_from_env("MNEMO_LOG").unwrap_or_else(|_| EnvFilter::new("mnemo_lib=info"));
    // A subscriber may already be installed (e.g. by tests); keeping the existing one is fine.
    let _ = tracing_subscriber::fmt().with_env_filter(filter).try_init();
}
