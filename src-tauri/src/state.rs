use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::db::Db;
use crate::error::{AppError, AppResult};
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
    /// Serializes media processing jobs: a new job waits for the running one instead of competing for ffmpeg.
    pub processing: tokio::sync::Mutex<()>,
    pub search: SearchGate,
}

impl AppState {
    pub fn initialize(app: &AppHandle) -> AppResult<Self> {
        let paths = AppPaths::resolve(app)?;
        let db = Db::open(&paths.database)?;
        Ok(Self {
            db,
            paths,
            processing: tokio::sync::Mutex::new(()),
            search: SearchGate::default(),
        })
    }
}
