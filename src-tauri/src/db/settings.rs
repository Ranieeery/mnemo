use rusqlite::{Connection, OptionalExtension, params};

use crate::domain::models::AppSettings;
use crate::domain::watch::{DEFAULT_WATCHED_THRESHOLD, validate_threshold};
use crate::error::{AppError, AppResult};

const WATCHED_THRESHOLD_KEY: &str = "watched_threshold";
const RECENT_FOLDER_ICONS_KEY: &str = "recent_folder_icons";
/// How many recently chosen folder icons the icon picker offers first.
const RECENT_FOLDER_ICONS_LIMIT: usize = 8;

fn stored(connection: &Connection, key: &str) -> AppResult<Option<String>> {
    Ok(connection
        .query_row("SELECT value FROM app_settings WHERE key = ?1", [key], |row| row.get(0))
        .optional()?)
}

fn store(connection: &Connection, key: &str, value: &str) -> AppResult<()> {
    connection.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// Loads the settings, falling back to defaults for missing or unreadable values.
pub fn load(connection: &Connection) -> AppResult<AppSettings> {
    let watched_threshold = stored(connection, WATCHED_THRESHOLD_KEY)?
        .and_then(|value| value.parse::<f64>().ok())
        .and_then(|value| validate_threshold(value).ok())
        .unwrap_or(DEFAULT_WATCHED_THRESHOLD);
    Ok(AppSettings { watched_threshold })
}

/// Validates and stores the settings.
pub fn save(connection: &Connection, settings: &AppSettings) -> AppResult<()> {
    let threshold = validate_threshold(settings.watched_threshold)?;
    store(connection, WATCHED_THRESHOLD_KEY, &threshold.to_string())
}

/// Folder icons chosen most recently, newest first. An unreadable value counts as no history.
pub fn recent_folder_icons(connection: &Connection) -> AppResult<Vec<String>> {
    Ok(stored(connection, RECENT_FOLDER_ICONS_KEY)?
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_default())
}

/// Moves `icon` to the front of the recent folder icons, keeping the list short and free of duplicates.
pub fn remember_folder_icon(connection: &Connection, icon: &str) -> AppResult<()> {
    let mut recent = recent_folder_icons(connection)?;
    recent.retain(|existing| existing != icon);
    recent.insert(0, icon.to_owned());
    recent.truncate(RECENT_FOLDER_ICONS_LIMIT);
    let value = serde_json::to_string(&recent).map_err(|error| AppError::Internal(error.to_string()))?;
    store(connection, RECENT_FOLDER_ICONS_KEY, &value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support;

    #[test]
    fn defaults_when_nothing_is_stored() {
        let connection = test_support::connection();
        assert_eq!(load(&connection).unwrap().watched_threshold, DEFAULT_WATCHED_THRESHOLD);
    }

    #[test]
    fn saves_and_loads_the_threshold() {
        let connection = test_support::connection();
        save(
            &connection,
            &AppSettings {
                watched_threshold: 0.75,
            },
        )
        .unwrap();
        assert_eq!(load(&connection).unwrap().watched_threshold, 0.75);
    }

    #[test]
    fn remembers_recent_folder_icons_newest_first_without_duplicates() {
        let connection = test_support::connection();
        assert!(recent_folder_icons(&connection).unwrap().is_empty());

        for icon in ["film", "tv", "film"] {
            remember_folder_icon(&connection, icon).unwrap();
        }
        assert_eq!(recent_folder_icons(&connection).unwrap(), ["film", "tv"]);

        for index in 0..10 {
            remember_folder_icon(&connection, &format!("icon-{index}")).unwrap();
        }
        let recent = recent_folder_icons(&connection).unwrap();
        assert_eq!(recent.len(), RECENT_FOLDER_ICONS_LIMIT);
        assert_eq!(recent.first().map(String::as_str), Some("icon-9"));
    }

    #[test]
    fn ignores_corrupted_recent_folder_icons() {
        let connection = test_support::connection();
        store(&connection, RECENT_FOLDER_ICONS_KEY, "not json").unwrap();
        assert!(recent_folder_icons(&connection).unwrap().is_empty());
        remember_folder_icon(&connection, "film").unwrap();
        assert_eq!(recent_folder_icons(&connection).unwrap(), ["film"]);
    }

    #[test]
    fn rejects_invalid_values_and_ignores_corrupted_ones() {
        let connection = test_support::connection();
        assert!(save(&connection, &AppSettings { watched_threshold: 0.3 }).is_err());
        connection
            .execute(
                "INSERT INTO app_settings (key, value) VALUES ('watched_threshold', 'abc')",
                [],
            )
            .unwrap();
        assert_eq!(load(&connection).unwrap().watched_threshold, DEFAULT_WATCHED_THRESHOLD);
    }
}
