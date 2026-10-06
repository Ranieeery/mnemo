use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::db::Db;
use crate::domain::media::processing_concurrency;
use crate::error::{AppError, AppResult};
use crate::services::media::Ffmpeg;
use crate::services::media::processing::{Notifier, Processor};
use crate::services::search::SearchGate;

const DATABASE_FILE: &str = "mnemo.db";
const THUMBNAILS_DIR: &str = "thumbnails";

pub struct AppPaths {
    pub database: PathBuf,
    pub thumbnails: PathBuf,
}

impl AppPaths {
    /// Same locations the legacy frontend used: `tauri-plugin-sql` resolved `sqlite:mnemo.db` against the app
    /// config dir, and thumbnails were written to `<appDataDir>/thumbnails`.
    fn resolve(app: &AppHandle) -> AppResult<Self> {
        let config_dir = app.path().app_config_dir()?;
        let data_dir = app.path().app_data_dir()?;
        let thumbnails = data_dir.join(THUMBNAILS_DIR);
        for dir in [&config_dir, &thumbnails] {
            std::fs::create_dir_all(dir).map_err(|error| AppError::io(dir, error))?;
        }
        Ok(Self {
            database: config_dir.join(DATABASE_FILE),
            thumbnails,
        })
    }
}

/// State shared by every command.
pub struct AppState {
    pub db: Db,
    pub paths: AppPaths,
    /// Reads new videos in the background; see `services::media::processing`.
    pub processor: Processor<Ffmpeg>,
    pub search: SearchGate,
}

impl AppState {
    pub fn initialize(app: &AppHandle, notify: Notifier) -> AppResult<Self> {
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
        Ok(Self {
            db,
            paths,
            processor,
            search: SearchGate::default(),
        })
    }
}
