use rusqlite::{Connection, OptionalExtension, params};

use crate::domain::models::AppSettings;
use crate::domain::watch::{DEFAULT_WATCHED_THRESHOLD, validate_threshold};
use crate::error::AppResult;

const WATCHED_THRESHOLD_KEY: &str = "watched_threshold";

/// Loads the settings, falling back to defaults for missing or unreadable values.
pub fn load(connection: &Connection) -> AppResult<AppSettings> {
    let stored: Option<String> = connection
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            [WATCHED_THRESHOLD_KEY],
            |row| row.get(0),
        )
        .optional()?;
    let watched_threshold = stored
        .and_then(|value| value.parse::<f64>().ok())
        .and_then(|value| validate_threshold(value).ok())
        .unwrap_or(DEFAULT_WATCHED_THRESHOLD);
    Ok(AppSettings { watched_threshold })
}

/// Validates and stores the settings.
pub fn save(connection: &Connection, settings: &AppSettings) -> AppResult<()> {
    let threshold = validate_threshold(settings.watched_threshold)?;
    connection.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        params![WATCHED_THRESHOLD_KEY, threshold.to_string()],
    )?;
    Ok(())
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
