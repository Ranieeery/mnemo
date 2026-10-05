use std::path::Path;

use serde::{Serialize, Serializer};
use specta::{Type, Types, datatype::DataType};

/// Every error the backend can report. Crosses the IPC boundary as [`IpcError`] (`{ kind, message }`).
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("database migration failed: {0}")]
    Migration(#[from] rusqlite_migration::Error),
    #[error("{message}: {path}")]
    Io { path: String, message: String },
    #[error("{0} not found")]
    NotFound(String),
    #[error("{0}")]
    InvalidInput(String),
    #[error("{tool} is not installed or is not on the PATH")]
    MediaToolMissing { tool: String },
    #[error("{tool} failed: {message}")]
    MediaProcessFailed { tool: String, message: String },
    #[error("{0} timed out")]
    Timeout(String),
    #[error("invalid library file: {0}")]
    ImportFormat(String),
    #[error("operation cancelled")]
    Cancelled,
    #[error("internal error: {0}")]
    Internal(String),
}

impl AppError {
    /// Wraps an I/O error together with the path it happened on, so the message is actionable.
    pub fn io(path: impl AsRef<Path>, error: std::io::Error) -> Self {
        Self::Io {
            path: path.as_ref().to_string_lossy().into_owned(),
            message: error.to_string(),
        }
    }

    pub fn kind(&self) -> ErrorKind {
        match self {
            Self::Database(_) | Self::Migration(_) => ErrorKind::Database,
            Self::Io { .. } => ErrorKind::Io,
            Self::NotFound(_) => ErrorKind::NotFound,
            Self::InvalidInput(_) => ErrorKind::InvalidInput,
            Self::MediaToolMissing { .. } => ErrorKind::MediaToolMissing,
            Self::MediaProcessFailed { .. } => ErrorKind::MediaProcessFailed,
            Self::Timeout(_) => ErrorKind::Timeout,
            Self::ImportFormat(_) => ErrorKind::ImportFormat,
            Self::Cancelled => ErrorKind::Cancelled,
            Self::Internal(_) => ErrorKind::Internal,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    Database,
    Io,
    NotFound,
    InvalidInput,
    MediaToolMissing,
    MediaProcessFailed,
    Timeout,
    ImportFormat,
    Cancelled,
    Internal,
}

/// Wire format of [`AppError`]: a stable `kind` for the UI to branch on and a human-readable `message`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct IpcError {
    pub kind: ErrorKind,
    pub message: String,
}

impl From<&AppError> for IpcError {
    fn from(error: &AppError) -> Self {
        Self {
            kind: error.kind(),
            message: error.to_string(),
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        IpcError::from(self).serialize(serializer)
    }
}

impl Type for AppError {
    fn definition(types: &mut Types) -> DataType {
        IpcError::definition(types)
    }
}

impl From<tokio::task::JoinError> for AppError {
    fn from(error: tokio::task::JoinError) -> Self {
        Self::Internal(error.to_string())
    }
}

impl From<tauri::Error> for AppError {
    fn from(error: tauri::Error) -> Self {
        Self::Internal(error.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_kind_and_message() {
        let error = AppError::MediaToolMissing { tool: "ffprobe".into() };
        let json = serde_json::to_value(&error).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "kind": "mediaToolMissing", "message": "ffprobe is not installed or is not on the PATH" })
        );
    }

    #[test]
    fn io_errors_carry_the_path() {
        let error = AppError::io("C:/videos", std::io::Error::from(std::io::ErrorKind::NotFound));
        assert!(error.to_string().ends_with(": C:/videos"));
        assert_eq!(error.kind(), ErrorKind::Io);
    }
}
