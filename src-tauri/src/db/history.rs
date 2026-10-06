//! The watch history: one row each time a video becomes watched.

use rusqlite::{Connection, params};

use super::videos::{COLUMNS, map_row};
use crate::domain::models::{DailyWatchTotal, HistoryCursor, HistoryEntry, HistoryPage};
use crate::error::AppResult;

/// Records that a video was watched (kept for parity with the legacy `watch_history` table).
pub fn record(connection: &Connection, video_id: i64, watched_seconds: f64) -> AppResult<()> {
    connection.execute(
        "INSERT INTO watch_history (video_id, watch_duration_seconds) VALUES (?1, ?2)",
        params![video_id, watched_seconds.round()],
    )?;
    Ok(())
}

/// History entries: one per video per local day, at its first time that day. Mnemo 1.x wrote a row on every
/// progress tick past the threshold, so its rows are grouped here rather than deleted. `?1` is an SQLite time
/// modifier ("-15 days") that limits the scan to recent rows, or `NULL` for all of them.
const ENTRIES: &str = "SELECT video_id, date(watched_at, 'localtime') AS day, MIN(watched_at) AS watched_at
                       FROM watch_history
                       WHERE watched_at IS NOT NULL AND (?1 IS NULL OR watched_at >= datetime('now', ?1))
                       GROUP BY video_id, day";

/// A page of the history, newest first, starting after `cursor`.
pub fn list_page(connection: &Connection, cursor: Option<&HistoryCursor>, limit: usize) -> AppResult<HistoryPage> {
    let sql = format!(
        "SELECT {COLUMNS}, e.day, strftime('%Y-%m-%dT%H:%M:%SZ', e.watched_at), e.watched_at
         FROM ({ENTRIES}) e JOIN videos v ON v.id = e.video_id
         WHERE ?2 IS NULL OR (e.watched_at, e.video_id) < (?2, ?3)
         ORDER BY e.watched_at DESC, e.video_id DESC
         LIMIT ?4"
    );
    let mut statement = connection.prepare_cached(&sql)?;
    let rows = statement
        .query_map(
            params![
                None::<String>,
                cursor.map(|cursor| cursor.watched_at.as_str()),
                cursor.map(|cursor| cursor.video_id),
                // One extra row tells whether an older page exists.
                (limit + 1) as i64
            ],
            |row| {
                let entry = HistoryEntry {
                    video: map_row(row)?,
                    day: row.get(11)?,
                    watched_at: row.get(12)?,
                };
                Ok((entry, row.get::<_, String>(13)?))
            },
        )?
        .collect::<Result<Vec<_>, _>>()?;

    let next_cursor = if rows.len() > limit {
        rows.get(limit.saturating_sub(1))
            .map(|(entry, stored_at)| HistoryCursor {
                watched_at: stored_at.clone(),
                video_id: entry.video.id,
            })
    } else {
        None
    };
    let entries = rows.into_iter().take(limit).map(|(entry, _)| entry).collect();
    Ok(HistoryPage { entries, next_cursor })
}

/// Totals for the last `days` local days including today, oldest first. Days without history are left out. Each
/// video counts once per day, with its full length.
pub fn daily_totals(connection: &Connection, days: u32) -> AppResult<Vec<DailyWatchTotal>> {
    let sql = format!(
        "SELECT e.day, COUNT(*), COALESCE(SUM(v.duration_seconds), 0)
         FROM ({ENTRIES}) e JOIN videos v ON v.id = e.video_id
         WHERE e.day >= date('now', 'localtime', ?2)
         GROUP BY e.day
         ORDER BY e.day"
    );
    // The scan starts a day earlier than the first local day, which covers every time zone.
    let scan_from = format!("-{} days", days.saturating_add(1));
    let first_day = format!("-{} days", days.saturating_sub(1));
    let mut statement = connection.prepare_cached(&sql)?;
    let totals = statement
        .query_map(params![scan_from, first_day], |row| {
            Ok(DailyWatchTotal {
                day: row.get(0)?,
                videos: row.get(1)?,
                seconds: row.get(2)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(totals)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support;
    use crate::db::videos::tests::{add_video, path};

    /// Stores a history row at a UTC time. Noon keeps the local date the same in time zones from -11h to +11h.
    fn watched_at(connection: &Connection, video_id: i64, at: &str) {
        connection
            .execute(
                "INSERT INTO watch_history (video_id, watched_at, watch_duration_seconds) VALUES (?1, ?2, 0)",
                params![video_id, at],
            )
            .unwrap();
    }

    fn days_and_ids(page: &HistoryPage) -> Vec<(&str, i64)> {
        page.entries
            .iter()
            .map(|entry| (entry.day.as_str(), entry.video.id))
            .collect()
    }

    #[test]
    fn groups_rows_per_video_per_day_newest_first() {
        let connection = test_support::connection();
        let pilot = add_video(&connection, &path(&["D:", "pilot.mkv"]), 1200.0);
        let finale = add_video(&connection, &path(&["D:", "finale.mkv"]), 1500.0);
        // The 1.x player wrote one row per progress tick.
        for minute in 10..40 {
            watched_at(&connection, pilot.id, &format!("2026-03-10 12:{minute}:00"));
        }
        watched_at(&connection, pilot.id, "2026-03-12 12:00:00");
        watched_at(&connection, finale.id, "2026-03-11 12:00:00");

        let page = list_page(&connection, None, 10).unwrap();
        assert_eq!(
            days_and_ids(&page),
            [
                ("2026-03-12", pilot.id),
                ("2026-03-11", finale.id),
                ("2026-03-10", pilot.id)
            ]
        );
        assert_eq!(page.entries[2].watched_at, "2026-03-10T12:10:00Z");
        assert_eq!(page.next_cursor, None);
    }

    #[test]
    fn pages_through_the_history_without_gaps_or_repeats() {
        let connection = test_support::connection();
        let mut expected = Vec::new();
        for day in 1..=7 {
            // Two videos at the same instant must both appear.
            for name in ["ep", "twin"] {
                let video = add_video(&connection, &path(&["D:", &format!("{name}{day}.mkv")]), 60.0);
                watched_at(&connection, video.id, &format!("2026-03-{day:02} 12:00:00"));
                expected.push(video.id);
            }
        }

        let mut seen = Vec::new();
        let mut cursor = None;
        loop {
            let page = list_page(&connection, cursor.as_ref(), 3).unwrap();
            assert!(page.entries.len() <= 3);
            seen.extend(page.entries.iter().map(|entry| entry.video.id));
            match page.next_cursor {
                Some(next) => cursor = Some(next),
                None => break,
            }
        }
        assert_eq!(seen.len(), expected.len());
        seen.sort_unstable();
        expected.sort_unstable();
        assert_eq!(seen, expected);
    }

    #[test]
    fn leaves_out_removed_videos_and_rows_without_a_date() {
        let connection = test_support::connection();
        let kept = add_video(&connection, &path(&["D:", "kept.mkv"]), 60.0);
        let removed = add_video(&connection, &path(&["D:", "removed.mkv"]), 60.0);
        watched_at(&connection, kept.id, "2026-03-10 12:00:00");
        watched_at(&connection, removed.id, "2026-03-10 12:00:00");
        connection
            .execute(
                "UPDATE watch_history SET watched_at = NULL WHERE video_id = ?1",
                [kept.id],
            )
            .unwrap();
        connection
            .execute("DELETE FROM videos WHERE id = ?1", [removed.id])
            .unwrap();

        assert!(list_page(&connection, None, 10).unwrap().entries.is_empty());
    }

    #[test]
    fn sums_each_video_once_per_day_within_the_period() {
        let connection = test_support::connection();
        let short = add_video(&connection, &path(&["D:", "short.mkv"]), 600.0);
        let long = add_video(&connection, &path(&["D:", "long.mkv"]), 3000.0);
        for _ in 0..5 {
            history_row_now(&connection, short.id);
        }
        history_row_now(&connection, long.id);
        connection
            .execute(
                "INSERT INTO watch_history (video_id, watched_at) VALUES (?1, datetime('now', '-30 days'))",
                [long.id],
            )
            .unwrap();

        let totals = daily_totals(&connection, 14).unwrap();
        assert_eq!(totals.len(), 1);
        assert_eq!(totals[0].videos, 2);
        assert_eq!(totals[0].seconds, 3600.0);
        assert_eq!(daily_totals(&connection, 60).unwrap().len(), 2);
    }

    fn history_row_now(connection: &Connection, video_id: i64) {
        record(connection, video_id, 0.0).unwrap();
    }
}
