//! The watch history screen.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

use super::Video;

/// Where a page of the watch history ends; pass it back to get the next (older) page. `watched_at` is the stored
/// timestamp, so treat the cursor as opaque.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HistoryCursor {
    pub watched_at: String,
    pub video_id: i64,
}

/// A video that became watched on a given day.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub video: Video,
    /// Local date, `YYYY-MM-DD`.
    pub day: String,
    /// When it first became watched that day, ISO 8601 in UTC.
    pub watched_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    /// Newest first.
    pub entries: Vec<HistoryEntry>,
    pub next_cursor: Option<HistoryCursor>,
}

/// How much was watched on one local day: the videos that became watched and their total length.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DailyWatchTotal {
    /// Local date, `YYYY-MM-DD`.
    pub day: String,
    pub videos: i64,
    #[specta(type = Number)]
    pub seconds: f64,
}
