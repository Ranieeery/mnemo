//! Watch status, playback progress and the settings that drive them.

use crate::db::{Db, settings, watch as watch_status};
use crate::domain::models::{AppSettings, Video};
use crate::error::AppResult;

/// Saves the playback position using the user's watched threshold. `finished` is set when playback reached the end.
pub async fn save_progress(db: &Db, video_id: i64, position_seconds: f64, finished: bool) -> AppResult<Video> {
    db.call(move |connection| {
        let threshold = settings::load(connection)?.watched_threshold;
        watch_status::save_progress(connection, video_id, position_seconds, threshold, finished)
    })
    .await
}

pub async fn set_watched(db: &Db, video_id: i64, watched: bool) -> AppResult<Video> {
    db.call(move |connection| {
        if watched {
            watch_status::mark_watched(connection, video_id)
        } else {
            watch_status::mark_unwatched(connection, video_id)
        }
    })
    .await
}

pub async fn set_folder_watched(db: &Db, path: String, watched: bool) -> AppResult<i64> {
    db.call(move |connection| Ok(watch_status::set_folder_watched(connection, &path, watched)? as i64))
        .await
}

pub async fn reset_all(db: &Db) -> AppResult<i64> {
    db.call(|connection| Ok(watch_status::reset_all_watch_status(connection)? as i64))
        .await
}

pub async fn get_settings(db: &Db) -> AppResult<AppSettings> {
    db.call(|connection| settings::load(connection)).await
}

pub async fn update_settings(db: &Db, new_settings: AppSettings) -> AppResult<AppSettings> {
    db.call(move |connection| {
        settings::save(connection, &new_settings)?;
        settings::load(connection)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::videos::{self, NewVideo};

    #[tokio::test]
    async fn progress_uses_the_configured_threshold() {
        let db = Db::open_in_memory().unwrap();
        let video = db
            .call(|connection| {
                videos::insert(
                    connection,
                    &NewVideo {
                        file_path: "a.mkv",
                        title: "a",
                        duration_seconds: 100.0,
                        thumbnail_path: None,
                    },
                )
            })
            .await
            .unwrap();

        assert!(!save_progress(&db, video.id, 80.0, false).await.unwrap().is_watched);
        update_settings(
            &db,
            AppSettings {
                watched_threshold: 0.75,
            },
        )
        .await
        .unwrap();
        assert!(save_progress(&db, video.id, 80.0, false).await.unwrap().is_watched);
    }
}
