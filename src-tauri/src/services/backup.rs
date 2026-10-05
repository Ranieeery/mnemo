use std::path::PathBuf;

use crate::db::Db;
use crate::db::backup::{self, LibraryFile};
use crate::domain::models::ImportSummary;
use crate::error::{AppError, AppResult};

pub async fn export_to_file(db: &Db, destination: PathBuf) -> AppResult<()> {
    let file = db.call(|connection| backup::export(connection)).await?;
    let json = serde_json::to_vec_pretty(&file).map_err(|error| AppError::Internal(error.to_string()))?;
    tokio::fs::write(&destination, json)
        .await
        .map_err(|error| AppError::io(&destination, error))
}

/// Replaces the library with the contents of a version 2 or legacy export.
pub async fn import_from_file(db: &Db, source: PathBuf) -> AppResult<ImportSummary> {
    let bytes = tokio::fs::read(&source)
        .await
        .map_err(|error| AppError::io(&source, error))?;
    let file: LibraryFile =
        serde_json::from_slice(&bytes).map_err(|error| AppError::ImportFormat(error.to_string()))?;
    db.call(move |connection| backup::import(connection, &file)).await
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
        let summary = import_from_file(&Db::open_in_memory().unwrap(), file).await.unwrap();
        assert_eq!(summary.folders, 1);
    }

    #[tokio::test]
    async fn invalid_json_is_an_import_format_error() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("broken.json");
        std::fs::write(&file, b"{ not json").unwrap();
        let result = import_from_file(&Db::open_in_memory().unwrap(), file).await;
        assert!(matches!(result, Err(AppError::ImportFormat(_))));
    }
}
