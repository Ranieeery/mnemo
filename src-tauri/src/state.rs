use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::db::{Db, settings};
use crate::domain::media::processing_concurrency;
use crate::error::{AppError, AppResult};
use crate::services::media::Ffmpeg;
use crate::services::media::playable_copy::PlayableCopies;
use crate::services::media::processing::{Notifier, Processor};
use crate::services::search::SearchGate;
use crate::services::sync::{LibrarySync, SyncNotifier, Timing};
use crate::services::updates::{self, UpdateChecker};

const DATABASE_FILE: &str = "mnemo.db";
const THUMBNAILS_DIR: &str = "thumbnails";
const PLAYABLE_COPIES_DIR: &str = "playable-copies";

pub struct AppPaths {
    pub database: PathBuf,
    pub thumbnails: PathBuf,
    /// MP4 copies of videos the player cannot open as they are (`services::media::playable_copy`).
    pub playable_copies: PathBuf,
}

impl AppPaths {
    /// Same locations the legacy frontend used: `tauri-plugin-sql` resolved `sqlite:mnemo.db` against the app
    /// config dir, and thumbnails were written to `<appDataDir>/thumbnails`.
    fn resolve(app: &AppHandle) -> AppResult<Self> {
        let config_dir = app.path().app_config_dir()?;
        let data_dir = app.path().app_data_dir()?;
        let thumbnails = data_dir.join(THUMBNAILS_DIR);
        let playable_copies = data_dir.join(PLAYABLE_COPIES_DIR);
        for dir in [&config_dir, &thumbnails, &playable_copies] {
            std::fs::create_dir_all(dir).map_err(|error| AppError::io(dir, error))?;
        }
        Ok(Self {
            database: config_dir.join(DATABASE_FILE),
            thumbnails,
            playable_copies,
        })
    }
}

/// State shared by every command.
pub struct AppState {
    pub db: Db,
    pub paths: AppPaths,
    /// Reads new videos in the background; see `services::media::processing`.
    pub processor: Processor<Ffmpeg>,
    /// Keeps the library in step with the disk; see `services::sync`.
    pub sync: LibrarySync<Ffmpeg>,
    pub search: SearchGate,
    pub playable_copies: PlayableCopies<Ffmpeg>,
    /// Looks for a newer release on GitHub; see `services::updates`.
    pub updates: UpdateChecker,
}

impl AppState {
    pub fn initialize(app: &AppHandle, notify: Notifier, notify_sync: SyncNotifier) -> AppResult<Self> {
        let paths = AppPaths::resolve(app)?;
        let db = Db::open(&paths.database)?;
        let cores = std::thread::available_parallelism().map_or(1, usize::from);
        let processor = Processor::new(
            db.clone(),
            Ffmpeg,
            paths.thumbnails.clone(),
            processing_concurrency(cores),
            notify,
        );
        let watch_folders =
            tauri::async_runtime::block_on(db.call(|connection| settings::get::<settings::WatchFolders>(connection)))?;
        let sync = LibrarySync::new(
            db.clone(),
            processor.clone(),
            paths.thumbnails.clone(),
            watch_folders,
            Timing::APP,
            notify_sync,
        );
        let playable_copies = PlayableCopies::new(db.clone(), Ffmpeg, paths.playable_copies.clone());
        let running = app.package_info().version.clone();
        let updates = UpdateChecker::new(db.clone(), updates::release_source(&running), running);
        Ok(Self {
            db,
            paths,
            processor,
            sync,
            search: SearchGate::default(),
            playable_copies,
            updates,
        })
    }
}
