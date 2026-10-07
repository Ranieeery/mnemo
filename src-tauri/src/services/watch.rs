//! Watch status, playback progress and the settings that drive them.

use crate::db::{Db, history, settings, watch as watch_status};
use crate::domain::models::{AppSettings, DailyWatchTotal, HistoryCursor, HistoryPage, PlayerPreferences, Video};
use crate::domain::shortcuts::KeyboardShortcuts;
use crate::domain::subtitle_style::SubtitleStyle;
use crate::error::{AppError, AppResult};

/// Largest page of watch history one call returns.
const MAX_HISTORY_PAGE: i64 = 200;
/// Longest period, in days, the watch totals cover.
const MAX_TOTAL_DAYS: i64 = 366;

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

/// A page of the watch history, newest first, after `cursor`.
pub async fn history_page(db: &Db, cursor: Option<HistoryCursor>, limit: i64) -> AppResult<HistoryPage> {
    if !(1..=MAX_HISTORY_PAGE).contains(&limit) {
        return Err(AppError::InvalidInput(format!(
            "a history page holds 1 to {MAX_HISTORY_PAGE} entries, not {limit}"
        )));
    }
    db.call(move |connection| history::list_page(connection, cursor.as_ref(), limit as usize))
        .await
}

/// Watched time per local day over the last `days` days, oldest first.
pub async fn daily_totals(db: &Db, days: i64) -> AppResult<Vec<DailyWatchTotal>> {
    if !(1..=MAX_TOTAL_DAYS).contains(&days) {
        return Err(AppError::InvalidInput(format!(
            "watch totals cover 1 to {MAX_TOTAL_DAYS} days, not {days}"
        )));
    }
    db.call(move |connection| history::daily_totals(connection, days as u32))
        .await
}

pub async fn player_preferences(db: &Db) -> AppResult<PlayerPreferences> {
    db.call(|connection| settings::get::<settings::Player>(connection))
        .await
}

/// Validates and stores the player preferences, returning what was stored.
pub async fn update_player_preferences(db: &Db, preferences: PlayerPreferences) -> AppResult<PlayerPreferences> {
    db.call(move |connection| settings::set::<settings::Player>(connection, preferences))
        .await
}

pub async fn keyboard_shortcuts(db: &Db) -> AppResult<KeyboardShortcuts> {
    db.call(|connection| settings::get::<settings::Shortcuts>(connection))
        .await
}

/// Validates and stores the keyboard shortcuts, returning what was stored.
pub async fn update_keyboard_shortcuts(db: &Db, shortcuts: KeyboardShortcuts) -> AppResult<KeyboardShortcuts> {
    db.call(move |connection| settings::set::<settings::Shortcuts>(connection, shortcuts))
        .await
}

pub async fn subtitle_style(db: &Db) -> AppResult<SubtitleStyle> {
    db.call(|connection| settings::get::<settings::Subtitles>(connection))
        .await
}

/// Validates and stores how subtitles look, returning what was stored.
pub async fn update_subtitle_style(db: &Db, style: SubtitleStyle) -> AppResult<SubtitleStyle> {
    db.call(move |connection| settings::set::<settings::Subtitles>(connection, style))
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
                        identity: None,
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
                watch_folders: false,
            },
        )
        .await
        .unwrap();
        assert!(save_progress(&db, video.id, 80.0, false).await.unwrap().is_watched);
    }

    #[tokio::test]
    async fn history_requests_are_bounded() {
        let db = Db::open_in_memory().unwrap();
        for limit in [0, 201] {
            assert!(matches!(
                history_page(&db, None, limit).await,
                Err(AppError::InvalidInput(_))
            ));
        }
        for days in [0, 367] {
            assert!(matches!(daily_totals(&db, days).await, Err(AppError::InvalidInput(_))));
        }
        assert!(history_page(&db, None, 200).await.unwrap().entries.is_empty());
        assert!(daily_totals(&db, 366).await.unwrap().is_empty());
    }
}
