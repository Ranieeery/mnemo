use rusqlite::{Connection, params};

use crate::error::AppResult;

/// Records that a video was watched (kept for parity with the legacy `watch_history` table).
pub fn record(connection: &Connection, video_id: i64, watched_seconds: f64) -> AppResult<()> {
    connection.execute(
        "INSERT INTO watch_history (video_id, watch_duration_seconds) VALUES (?1, ?2)",
        params![video_id, watched_seconds.round()],
    )?;
    Ok(())
}
