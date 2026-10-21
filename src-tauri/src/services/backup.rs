use std::path::PathBuf;

use crate::db::Db;
use crate::db::backup::{self, LibraryFile};
use crate::error::{AppError, AppResult};

pub async fn export_to_file(db: &Db, destination: PathBuf) -> AppResult<()> {
    let file = db.call(|connection| backup::export(connection)).await?;
    let json = serde_json::to_vec_pretty(&file).map_err(|error| AppError::Internal(error.to_string()))?;
    tokio::fs::write(&destination, json)
        .await
        .map_err(|error| AppError::io(&destination, error))
}

/// Reads a version 2 or legacy export. The library sync imports it (`LibrarySync::import`), so no comparison runs
/// against the replaced library.
pub async fn read_file(source: PathBuf) -> AppResult<LibraryFile> {
    let bytes = tokio::fs::read(&source)
        .await
        .map_err(|error| AppError::io(&source, error))?;
    let file: LibraryFile =
        serde_json::from_slice(&bytes).map_err(|error| AppError::ImportFormat(error.to_string()))?;
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn round_trips_through_a_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("library.json");
        let db = Db::open_in_memory().unwrap();
        db.call(|connection| Ok(connection.execute("INSERT INTO library_folders (path) VALUES ('Videos')", [])?))
            .await
            .unwrap();

        export_to_file(&db, file.clone()).await.unwrap();
        let read = read_file(file).await.unwrap();
        assert_eq!(read, db.call(|connection| backup::export(connection)).await.unwrap());
    }

    #[tokio::test]
    async fn invalid_json_is_an_import_format_error() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("broken.json");
        std::fs::write(&file, b"{ not json").unwrap();
        assert!(matches!(read_file(file).await, Err(AppError::ImportFormat(_))));
    }
}
