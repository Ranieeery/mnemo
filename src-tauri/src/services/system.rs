//! Hand-off to the operating system: default player and file manager.

use std::path::PathBuf;

use crate::db::{Db, folders};
use crate::error::{AppError, AppResult};
use crate::services::library::ensure_in_library;

async fn library_file(db: &Db, path: String) -> AppResult<PathBuf> {
    let checked = path.clone();
    db.call(move |connection| ensure_in_library(checked.as_ref(), &folders::paths(connection)?))
        .await?;
    let path = PathBuf::from(path);
    if tokio::fs::try_exists(&path).await.unwrap_or(false) {
        Ok(path)
    } else {
        Err(AppError::NotFound(path.to_string_lossy().into_owned()))
    }
}

/// Opens a library file with the system's default application (e.g. an external video player).
pub async fn open_externally(db: &Db, path: String) -> AppResult<()> {
    let path = library_file(db, path).await?;
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|error| AppError::Internal(error.to_string()))
}

/// Shows a library file selected in the system file manager.
pub async fn reveal_in_file_manager(db: &Db, path: String) -> AppResult<()> {
    let path = library_file(db, path).await?;
    tauri_plugin_opener::reveal_item_in_dir(&path).map_err(|error| AppError::Internal(error.to_string()))
}
