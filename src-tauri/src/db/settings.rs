//! Typed access to `app_settings`: each setting declares its key, value type, default and validation, and is stored
//! as JSON. Values written before this module existed (a bare number, a JSON array) are valid JSON already.

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use serde::de::DeserializeOwned;

use crate::domain::models::{AppSettings, PlayerPreferences};
use crate::domain::player::{validate_speed, validate_up_next_width, validate_volume};
use crate::domain::shortcuts::{KeyboardShortcuts, repair_shortcuts, validate_shortcuts};
use crate::domain::subtitle_style::{SubtitleStyle, repair_subtitle_style, validate_subtitle_style};
use crate::domain::watch::{DEFAULT_WATCHED_THRESHOLD, validate_threshold};
use crate::error::{AppError, AppResult};

/// A value kept in `app_settings` under a fixed key.
pub trait Setting {
    const KEY: &'static str;
    type Value: Serialize + DeserializeOwned;

    fn default_value() -> Self::Value;

    /// Reads the stored JSON, or gives up (the default is used).
    fn decode(stored: serde_json::Value) -> Option<Self::Value> {
        serde_json::from_value(stored).ok()
    }

    /// Checks a value before it is stored.
    fn validate(value: Self::Value) -> AppResult<Self::Value> {
        Ok(value)
    }

    /// Makes a stored value usable, or gives up (the default is used). Rejects what `validate` rejects unless a
    /// setting knows how to repair part of it.
    fn repair(value: Self::Value) -> Option<Self::Value> {
        Self::validate(value).ok()
    }
}

/// Starts from the default and takes each stored field that still reads as its type, so fields missing from the
/// stored object (added by a later version) or unreadable ones (an enum value that no longer exists) keep their
/// default without losing the others.
fn merge_onto_default<T: Serialize + DeserializeOwned>(default: T, stored: serde_json::Value) -> Option<T> {
    let serde_json::Value::Object(fields) = stored else {
        return None;
    };
    let mut merged = serde_json::to_value(default).ok()?;
    for (key, value) in fields {
        let mut candidate = merged.clone();
        candidate.as_object_mut()?.insert(key, value);
        if serde_json::from_value::<T>(candidate.clone()).is_ok() {
            merged = candidate;
        }
    }
    serde_json::from_value(merged).ok()
}

/// Reads a setting. Missing, unreadable or invalid stored values give the default, so a bad row never breaks a
/// screen; they are logged.
pub fn get<S: Setting>(connection: &Connection) -> AppResult<S::Value> {
    let stored: Option<String> = connection
        .query_row("SELECT value FROM app_settings WHERE key = ?1", [S::KEY], |row| {
            row.get(0)
        })
        .optional()?;
    let Some(stored) = stored else {
        return Ok(S::default_value());
    };
    let value = serde_json::from_str(&stored)
        .ok()
        .and_then(S::decode)
        .and_then(S::repair);
    Ok(value.unwrap_or_else(|| {
        tracing::warn!(key = S::KEY, %stored, "ignoring an unreadable setting");
        S::default_value()
    }))
}

/// Validates and stores a setting, returning what was stored.
pub fn set<S: Setting>(connection: &Connection, value: S::Value) -> AppResult<S::Value> {
    let value = S::validate(value)?;
    let json = serde_json::to_string(&value).map_err(|error| AppError::Internal(error.to_string()))?;
    connection.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        params![S::KEY, json],
    )?;
    Ok(value)
}

pub struct WatchedThreshold;

impl Setting for WatchedThreshold {
    const KEY: &'static str = "watched_threshold";
    type Value = f64;

    fn default_value() -> f64 {
        DEFAULT_WATCHED_THRESHOLD
    }

    fn validate(threshold: f64) -> AppResult<f64> {
        validate_threshold(threshold)
    }
}

/// Whether library folders are watched for changes.
pub struct WatchFolders;

impl Setting for WatchFolders {
    const KEY: &'static str = "watch_folders";
    type Value = bool;

    fn default_value() -> bool {
        true
    }
}

/// Folder icons chosen most recently, newest first.
pub struct RecentFolderIcons;

/// How many recently chosen folder icons the icon picker offers first.
const RECENT_FOLDER_ICONS_LIMIT: usize = 8;

impl Setting for RecentFolderIcons {
    const KEY: &'static str = "recent_folder_icons";
    type Value = Vec<String>;

    fn default_value() -> Vec<String> {
        Vec::new()
    }
}

/// Volume, speed, subtitles and layout of the built-in player, kept between sessions.
pub struct Player;

impl Setting for Player {
    const KEY: &'static str = "player_preferences";
    type Value = PlayerPreferences;

    fn default_value() -> PlayerPreferences {
        PlayerPreferences::default()
    }

    fn decode(stored: serde_json::Value) -> Option<PlayerPreferences> {
        merge_onto_default(PlayerPreferences::default(), stored)
    }

    fn validate(preferences: PlayerPreferences) -> AppResult<PlayerPreferences> {
        validate_volume(preferences.volume)?;
        validate_speed(preferences.speed)?;
        validate_up_next_width(preferences.up_next_width)?;
        Ok(preferences)
    }

    /// A bad field falls back to its default on its own, so one odd value does not reset everything.
    fn repair(preferences: PlayerPreferences) -> Option<PlayerPreferences> {
        let defaults = PlayerPreferences::default();
        Some(PlayerPreferences {
            volume: validate_volume(preferences.volume).unwrap_or(defaults.volume),
            speed: validate_speed(preferences.speed).unwrap_or(defaults.speed),
            up_next_width: validate_up_next_width(preferences.up_next_width).unwrap_or(defaults.up_next_width),
            ..preferences
        })
    }
}

/// The configurable keyboard shortcuts.
pub struct Shortcuts;

impl Setting for Shortcuts {
    const KEY: &'static str = "keyboard_shortcuts";
    type Value = KeyboardShortcuts;

    fn default_value() -> KeyboardShortcuts {
        KeyboardShortcuts::default()
    }

    /// Actions missing from the stored object (added by a later version) take their default keys.
    fn decode(stored: serde_json::Value) -> Option<KeyboardShortcuts> {
        merge_onto_default(KeyboardShortcuts::default(), stored)
    }

    fn validate(shortcuts: KeyboardShortcuts) -> AppResult<KeyboardShortcuts> {
        validate_shortcuts(&shortcuts)?;
        Ok(shortcuts)
    }

    fn repair(shortcuts: KeyboardShortcuts) -> Option<KeyboardShortcuts> {
        Some(repair_shortcuts(shortcuts))
    }
}

/// How subtitles look in the player.
pub struct Subtitles;

impl Setting for Subtitles {
    const KEY: &'static str = "subtitle_style";
    type Value = SubtitleStyle;

    fn default_value() -> SubtitleStyle {
        SubtitleStyle::default()
    }

    fn decode(stored: serde_json::Value) -> Option<SubtitleStyle> {
        merge_onto_default(SubtitleStyle::default(), stored)
    }

    fn validate(style: SubtitleStyle) -> AppResult<SubtitleStyle> {
        validate_subtitle_style(&style)?;
        Ok(style)
    }

    fn repair(style: SubtitleStyle) -> Option<SubtitleStyle> {
        Some(repair_subtitle_style(style))
    }
}

/// The settings shown in Settings and included in backups.
pub fn load(connection: &Connection) -> AppResult<AppSettings> {
    Ok(AppSettings {
        watched_threshold: get::<WatchedThreshold>(connection)?,
        watch_folders: get::<WatchFolders>(connection)?,
    })
}

pub fn save(connection: &Connection, settings: &AppSettings) -> AppResult<()> {
    set::<WatchedThreshold>(connection, settings.watched_threshold)?;
    set::<WatchFolders>(connection, settings.watch_folders)?;
    Ok(())
}

/// Moves `icon` to the front of the recent folder icons, keeping the list short and free of duplicates.
pub fn remember_folder_icon(connection: &Connection, icon: &str) -> AppResult<()> {
    let mut recent = get::<RecentFolderIcons>(connection)?;
    recent.retain(|existing| existing != icon);
    recent.insert(0, icon.to_owned());
    recent.truncate(RECENT_FOLDER_ICONS_LIMIT);
    set::<RecentFolderIcons>(connection, recent)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support;

    fn store_raw(connection: &Connection, key: &str, value: &str) {
        connection
            .execute(
                "INSERT INTO app_settings (key, value) VALUES (?1, ?2)",
                params![key, value],
            )
            .unwrap();
    }

    #[test]
    fn defaults_when_nothing_is_stored() {
        let connection = test_support::connection();
        assert_eq!(load(&connection).unwrap().watched_threshold, DEFAULT_WATCHED_THRESHOLD);
        assert!(get::<RecentFolderIcons>(&connection).unwrap().is_empty());
        assert_eq!(get::<Player>(&connection).unwrap(), PlayerPreferences::default());
    }

    #[test]
    fn saves_and_loads_the_threshold() {
        let connection = test_support::connection();
        save(
            &connection,
            &AppSettings {
                watched_threshold: 0.75,
                watch_folders: false,
            },
        )
        .unwrap();
        let loaded = load(&connection).unwrap();
        assert_eq!(loaded.watched_threshold, 0.75);
        assert!(!loaded.watch_folders);
    }

    #[test]
    fn reads_values_stored_by_earlier_2_x_versions() {
        // 2.0 stored the threshold with `f64::to_string` and the icons as a JSON array.
        let connection = test_support::connection();
        store_raw(&connection, "watched_threshold", "1");
        store_raw(&connection, "recent_folder_icons", r#"["film","tv"]"#);
        assert_eq!(load(&connection).unwrap().watched_threshold, 1.0);
        assert_eq!(get::<RecentFolderIcons>(&connection).unwrap(), ["film", "tv"]);
    }

    #[test]
    fn remembers_recent_folder_icons_newest_first_without_duplicates() {
        let connection = test_support::connection();
        for icon in ["film", "tv", "film"] {
            remember_folder_icon(&connection, icon).unwrap();
        }
        assert_eq!(get::<RecentFolderIcons>(&connection).unwrap(), ["film", "tv"]);

        for index in 0..10 {
            remember_folder_icon(&connection, &format!("icon-{index}")).unwrap();
        }
        let recent = get::<RecentFolderIcons>(&connection).unwrap();
        assert_eq!(recent.len(), RECENT_FOLDER_ICONS_LIMIT);
        assert_eq!(recent.first().map(String::as_str), Some("icon-9"));
    }

    #[test]
    fn ignores_corrupted_values() {
        let connection = test_support::connection();
        store_raw(&connection, "watched_threshold", "abc");
        store_raw(&connection, "recent_folder_icons", "not json");
        store_raw(&connection, "player_preferences", "[1, 2]");
        assert_eq!(load(&connection).unwrap().watched_threshold, DEFAULT_WATCHED_THRESHOLD);
        assert!(get::<RecentFolderIcons>(&connection).unwrap().is_empty());
        assert_eq!(get::<Player>(&connection).unwrap(), PlayerPreferences::default());

        remember_folder_icon(&connection, "film").unwrap();
        assert_eq!(get::<RecentFolderIcons>(&connection).unwrap(), ["film"]);
    }

    #[test]
    fn rejects_invalid_values_on_write() {
        let connection = test_support::connection();
        assert!(
            save(
                &connection,
                &AppSettings {
                    watched_threshold: 0.3,
                    watch_folders: true
                }
            )
            .is_err()
        );
        let loud = PlayerPreferences {
            volume: 1.5,
            ..PlayerPreferences::default()
        };
        assert!(matches!(
            set::<Player>(&connection, loud),
            Err(AppError::InvalidInput(_))
        ));
        assert_eq!(get::<Player>(&connection).unwrap(), PlayerPreferences::default());
    }

    #[test]
    fn player_preferences_round_trip() {
        let connection = test_support::connection();
        let preferences = PlayerPreferences {
            volume: 0.4,
            muted: true,
            speed: 1.25,
            subtitles_enabled: false,
            theater: true,
            up_next_width: Some(420),
        };
        assert_eq!(set::<Player>(&connection, preferences.clone()).unwrap(), preferences);
        assert_eq!(get::<Player>(&connection).unwrap(), preferences);
    }

    #[test]
    fn keyboard_shortcuts_fill_missing_actions_and_repair_bad_keys() {
        let connection = test_support::connection();
        assert_eq!(get::<Shortcuts>(&connection).unwrap(), KeyboardShortcuts::default());
        // Stored by an older version (no history keys) with a key that later became invalid.
        store_raw(
            &connection,
            "keyboard_shortcuts",
            r#"{"playPause":["P"],"mute":["Escape"],"theater":[]}"#,
        );
        let shortcuts = get::<Shortcuts>(&connection).unwrap();
        assert_eq!(shortcuts.play_pause, ["P"]);
        assert_eq!(shortcuts.mute, ["M"]);
        assert!(shortcuts.theater.is_empty());
        assert_eq!(shortcuts.history_back, ["Alt+ArrowLeft"]);

        let conflicting = KeyboardShortcuts {
            mute: vec!["P".into()],
            ..shortcuts.clone()
        };
        assert!(matches!(
            set::<Shortcuts>(&connection, conflicting),
            Err(AppError::InvalidInput(_))
        ));
        assert_eq!(set::<Shortcuts>(&connection, shortcuts.clone()).unwrap(), shortcuts);
    }

    #[test]
    fn subtitle_style_keeps_readable_fields_and_repairs_the_rest() {
        use crate::domain::subtitle_style::{SubtitleColor, SubtitleFont};

        let connection = test_support::connection();
        assert_eq!(get::<Subtitles>(&connection).unwrap(), SubtitleStyle::default());
        // A color that does not exist and a size out of range: only those fall back.
        store_raw(
            &connection,
            "subtitle_style",
            r#"{"size":900,"color":"orange","background":false,"font":"serif"}"#,
        );
        let style = get::<Subtitles>(&connection).unwrap();
        assert_eq!(style.size, 100);
        assert_eq!(style.color, SubtitleColor::White);
        assert!(!style.background);
        assert_eq!(style.font, SubtitleFont::Serif);

        let big = SubtitleStyle { size: 150, ..style };
        assert_eq!(set::<Subtitles>(&connection, big).unwrap(), big);
        assert!(matches!(
            set::<Subtitles>(&connection, SubtitleStyle { size: 15, ..style }),
            Err(AppError::InvalidInput(_))
        ));
    }

    #[test]
    fn repairs_stored_player_preferences_field_by_field() {
        let connection = test_support::connection();
        // An out-of-range speed and width, and missing fields: the rest is kept.
        store_raw(
            &connection,
            "player_preferences",
            r#"{"volume":0.3,"muted":true,"speed":9,"subtitlesEnabled":false,"upNextWidth":5000}"#,
        );
        assert_eq!(
            get::<Player>(&connection).unwrap(),
            PlayerPreferences {
                volume: 0.3,
                muted: true,
                speed: 1.0,
                subtitles_enabled: false,
                theater: false,
                up_next_width: None,
            }
        );
    }
}
