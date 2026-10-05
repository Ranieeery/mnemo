//! Watch status and playback progress of videos.

use rusqlite::{Connection, params};

use super::history;
use super::videos::get;
use crate::domain::models::Video;
use crate::domain::paths::FolderBounds;
use crate::domain::watch::reaches_threshold;
use crate::error::{AppError, AppResult};

/// Explicitly marks a video as watched (progress jumps to the end) and records it in the watch history.
pub fn mark_watched(connection: &mut Connection, id: i64) -> AppResult<Video> {
    let transaction = connection.transaction()?;
    let video = get(&transaction, id)?;
    transaction.execute(
        "UPDATE videos
         SET is_watched = 1, watch_progress_seconds = ?2, last_watched_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![id, video.duration_seconds],
    )?;
    history::record(&transaction, id, video.duration_seconds)?;
    let updated = get(&transaction, id)?;
    transaction.commit()?;
    Ok(updated)
}

pub fn mark_unwatched(connection: &Connection, id: i64) -> AppResult<Video> {
    let changed = connection.execute(
        "UPDATE videos SET is_watched = 0, watch_progress_seconds = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        [id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("video {id}")));
    }
    get(connection, id)
}

/// Saves the playback position. The video becomes watched (and a history row is written, once) when the position
/// reaches `threshold` or playback `finished`. Watched videos stay watched until explicitly unmarked.
pub fn save_progress(
    connection: &mut Connection,
    id: i64,
    position_seconds: f64,
    threshold: f64,
    finished: bool,
) -> AppResult<Video> {
    let transaction = connection.transaction()?;
    let video = get(&transaction, id)?;
    let mut position = position_seconds.max(0.0);
    if video.duration_seconds > 0.0 {
        position = position.min(video.duration_seconds);
        if finished {
            position = video.duration_seconds;
        }
    }
    let becomes_watched =
        !video.is_watched && (finished || reaches_threshold(position, video.duration_seconds, threshold));

    transaction.execute(
        "UPDATE videos
         SET watch_progress_seconds = ?2, is_watched = ?3, last_watched_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![id, position, video.is_watched || becomes_watched],
    )?;
    if becomes_watched {
        history::record(&transaction, id, position)?;
    }
    let updated = get(&transaction, id)?;
    transaction.commit()?;
    Ok(updated)
}

/// Marks every video inside `folder` as watched or unwatched. Returns how many changed.
pub fn set_folder_watched(connection: &Connection, folder: &str, watched: bool) -> AppResult<usize> {
    let bounds = FolderBounds::new(folder);
    let sql = if watched {
        "UPDATE videos SET is_watched = 1, last_watched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE file_path >= ?1 AND file_path < ?2 AND is_watched = 0"
    } else {
        "UPDATE videos SET is_watched = 0, watch_progress_seconds = 0, updated_at = CURRENT_TIMESTAMP
         WHERE file_path >= ?1 AND file_path < ?2 AND is_watched = 1"
    };
    Ok(connection.execute(sql, params![bounds.lower, bounds.upper])?)
}

/// Clears the watch status and progress of every video. Tags are not touched.
pub fn reset_all_watch_status(connection: &Connection) -> AppResult<usize> {
    Ok(connection.execute(
        "UPDATE videos
         SET is_watched = 0, watch_progress_seconds = 0, last_watched_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE is_watched <> 0 OR watch_progress_seconds <> 0 OR last_watched_at IS NOT NULL",
        [],
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support;
    use crate::db::videos::stats_in_folder;
    use crate::db::videos::tests::{add_video, path};

    fn history_rows(connection: &Connection, id: i64) -> i64 {
        connection
            .query_row("SELECT COUNT(*) FROM watch_history WHERE video_id = ?1", [id], |row| {
                row.get(0)
            })
            .unwrap()
    }

    #[test]
    fn save_progress_marks_watched_once_at_the_threshold() {
        // Regression (B2): every progress tick after the threshold used to add a history row.
        let mut connection = test_support::connection();
        let video = add_video(&connection, "a.mkv", 100.0);

        let partial = save_progress(&mut connection, video.id, 50.0, 0.9, false).unwrap();
        assert!(!partial.is_watched);
        assert_eq!(partial.watch_progress_seconds, 50.0);
        assert!(partial.last_watched_at.is_some());

        for position in [90.0, 92.0, 95.0] {
            assert!(
                save_progress(&mut connection, video.id, position, 0.9, false)
                    .unwrap()
                    .is_watched
            );
        }
        assert_eq!(history_rows(&connection, video.id), 1);
    }

    #[test]
    fn watched_status_is_sticky_when_rewatching() {
        let mut connection = test_support::connection();
        let video = add_video(&connection, "a.mkv", 100.0);
        save_progress(&mut connection, video.id, 95.0, 0.9, false).unwrap();
        let rewatch = save_progress(&mut connection, video.id, 5.0, 0.9, false).unwrap();
        assert!(rewatch.is_watched);
        assert_eq!(rewatch.watch_progress_seconds, 5.0);
    }

    #[test]
    fn finishing_playback_marks_watched_below_the_threshold() {
        let mut connection = test_support::connection();
        let video = add_video(&connection, "a.mkv", 100.0);
        let finished = save_progress(&mut connection, video.id, 80.0, 1.0, true).unwrap();
        assert!(finished.is_watched);
        assert_eq!(finished.watch_progress_seconds, 100.0);
    }

    #[test]
    fn progress_is_clamped_to_the_duration() {
        let mut connection = test_support::connection();
        let video = add_video(&connection, "a.mkv", 100.0);
        assert_eq!(
            save_progress(&mut connection, video.id, 150.0, 0.9, false)
                .unwrap()
                .watch_progress_seconds,
            100.0
        );
        assert_eq!(
            save_progress(&mut connection, video.id, -3.0, 0.9, false)
                .unwrap()
                .watch_progress_seconds,
            0.0
        );
    }

    #[test]
    fn mark_watched_and_unwatched() {
        let mut connection = test_support::connection();
        let video = add_video(&connection, "a.mkv", 100.0);
        let watched = mark_watched(&mut connection, video.id).unwrap();
        assert!(watched.is_watched);
        assert_eq!(watched.watch_progress_seconds, 100.0);
        assert_eq!(history_rows(&connection, video.id), 1);

        let unwatched = mark_unwatched(&connection, video.id).unwrap();
        assert!(!unwatched.is_watched);
        assert_eq!(unwatched.watch_progress_seconds, 0.0);
    }

    #[test]
    fn folder_watched_counts_only_changed_videos() {
        let mut connection = test_support::connection();
        let first = add_video(&connection, &path(&["F", "a.mkv"]), 10.0);
        add_video(&connection, &path(&["F", "b.mkv"]), 10.0);
        mark_watched(&mut connection, first.id).unwrap();

        assert_eq!(set_folder_watched(&connection, "F", true).unwrap(), 1);
        assert_eq!(stats_in_folder(&connection, "F").unwrap().watched_videos, 2);
        assert_eq!(set_folder_watched(&connection, "F", false).unwrap(), 2);
        assert_eq!(stats_in_folder(&connection, "F").unwrap().watched_videos, 0);
    }

    #[test]
    fn reset_clears_watch_state_but_keeps_tags() {
        // Regression: the legacy reset also deleted every tag assignment.
        let mut connection = test_support::connection();
        let video = add_video(&connection, "a.mkv", 100.0);
        mark_watched(&mut connection, video.id).unwrap();
        connection
            .execute("INSERT INTO tags (id, name) VALUES (1, 'keep')", [])
            .unwrap();
        connection
            .execute("INSERT INTO video_tags (video_id, tag_id) VALUES (?1, 1)", [video.id])
            .unwrap();

        assert_eq!(reset_all_watch_status(&connection).unwrap(), 1);
        let reset = get(&connection, video.id).unwrap();
        assert!(!reset.is_watched);
        assert_eq!(reset.watch_progress_seconds, 0.0);
        assert_eq!(reset.last_watched_at, None);
        let tags: i64 = connection
            .query_row("SELECT COUNT(*) FROM video_tags", [], |row| row.get(0))
            .unwrap();
        assert_eq!(tags, 1);
    }
}
