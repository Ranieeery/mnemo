//! What the processing pipeline reports.

use serde::{Deserialize, Serialize};
use specta::Type;

/// What a processing job did with the videos of its folder.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProcessingSummary {
    /// New videos added to the library.
    pub processed: i64,
    /// Videos already in the library, or being read by another job.
    pub skipped: i64,
    pub failed: i64,
}

/// One folder being read in the background.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProcessingJob {
    pub folder: String,
    /// Still listing the folder's files; `total` is not known yet.
    pub scanning: bool,
    /// New videos to read.
    pub total: i64,
    /// Read so far, successfully or not.
    pub done: i64,
    pub failed: i64,
}

/// A video that could not be read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileError {
    pub path: String,
    pub message: String,
}

/// Everything the processing pipeline is doing, sent to the frontend whenever it changes.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProcessingStatus {
    /// In the order they run.
    pub jobs: Vec<ProcessingJob>,
    /// Paths of the files being read right now.
    pub in_flight: Vec<String>,
    /// Some job was cancelled and is waiting for its running files to stop.
    pub cancelling: bool,
    /// The most recent failures of the current run, newest last.
    pub errors: Vec<FileError>,
}

/// How a job ended, sent once per job.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProcessingOutcome {
    pub folder: String,
    pub summary: ProcessingSummary,
    pub cancelled: bool,
    /// ffmpeg or ffprobe could not be run, so the job stopped.
    pub missing_tool: bool,
    /// The folder itself could not be read.
    pub error: Option<String>,
    /// The folder was removed from the library while it was being read; nothing to tell the user.
    pub removed: bool,
    /// Someone asked to be told how it went (a sync from the menu or Settings).
    pub report: bool,
}
