//! Hand-off to the operating system: default player and file manager.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::services::library::library_file;

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
