//! The library file: its format, the records it holds and how old exports are read.

use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};

use crate::domain::folder_order::LibraryFolderSort;
use crate::domain::models::AppSettings;
use crate::error::{AppError, AppResult};

pub const FORMAT_NAME: &str = "mnemo-library";
pub const FORMAT_VERSION: u32 = 2;

/// A library file. Version 2 is written by this app; files without `formatVersion` are legacy exports
/// (`version: "1.0.0"`, `exportDate`, no history, folder settings or settings).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFile {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format_version: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_version: Option<String>,
    #[serde(default, alias = "exportDate")]
    pub exported_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub settings: Option<SettingsRecord>,
    /// Added in 2.4. Files without it (or with a mode this version does not know) keep the current mode.
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "known_or_none")]
    pub library_folder_sort: Option<LibraryFolderSort>,
    pub library_folders: Vec<LibraryFolderRecord>,
    #[serde(default)]
    pub folder_settings: Vec<FolderSettingRecord>,
    /// Folders hidden from the home page and the history, added in 2.4. Files without it import with nothing
    /// hidden.
    #[serde(default)]
    pub hidden_folders: Vec<String>,
    /// Groups of library folders, added in 2.5. Files without them import with no groups.
    #[serde(default)]
    pub library_groups: Vec<LibraryGroupRecord>,
    pub videos: Vec<VideoRecord>,
    pub tags: Vec<TagRecord>,
    pub video_tags: Vec<VideoTagRecord>,
    #[serde(default)]
    pub watch_history: Vec<WatchHistoryRecord>,
}

/// The settings in a file. Each one is optional: a file from before it existed (`watchFolders` came in 2.3), or with
/// a value this version would refuse, imports it as the default.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsRecord {
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "known_or_none")]
    pub watched_threshold: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "known_or_none")]
    pub watch_folders: Option<bool>,
}

impl From<AppSettings> for SettingsRecord {
    fn from(settings: AppSettings) -> Self {
        Self {
            watched_threshold: Some(settings.watched_threshold),
            watch_folders: Some(settings.watch_folders),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LibraryFolderRecord {
    pub id: i64,
    pub path: String,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub custom_icon: Option<String>,
    /// Added in 2.4; older exports have none (the default color).
    #[serde(default)]
    pub icon_color: Option<String>,
    /// Position in the custom order, added in 2.4. Folders without one go after the others, by date added.
    #[serde(default)]
    pub sort_order: Option<i64>,
    /// The name given in the app, added in 2.5. Older exports have none (the folder's own name).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_name: Option<String>,
    /// Added in 2.5. A group missing from the file leaves the folder without one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LibraryGroupRecord {
    pub id: i64,
    pub name: String,
    #[serde(default)]
    pub sort_order: Option<i64>,
    #[serde(default)]
    pub collapsed: bool,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FolderSettingRecord {
    pub path: String,
    pub view_mode: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VideoRecord {
    pub id: i64,
    pub file_path: String,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub duration_seconds: Option<f64>,
    #[serde(default)]
    pub thumbnail_path: Option<String>,
    #[serde(default, deserialize_with = "flexible_bool")]
    pub is_watched: bool,
    #[serde(default)]
    pub watch_progress_seconds: Option<f64>,
    #[serde(default)]
    pub last_watched_at: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TagRecord {
    pub id: i64,
    pub name: String,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VideoTagRecord {
    #[serde(default)]
    pub id: Option<i64>,
    pub video_id: i64,
    pub tag_id: i64,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WatchHistoryRecord {
    pub id: i64,
    pub video_id: i64,
    #[serde(default)]
    pub watched_at: Option<String>,
    #[serde(default)]
    pub watch_duration_seconds: Option<f64>,
}

/// A value this version cannot read is left out instead of failing the import.
fn known_or_none<'de, D: Deserializer<'de>, T: DeserializeOwned>(deserializer: D) -> Result<Option<T>, D::Error> {
    Ok(Option::<serde_json::Value>::deserialize(deserializer)?.and_then(|value| serde_json::from_value(value).ok()))
}

/// Legacy exports wrote `is_watched` as whatever the SQL plugin returned: a boolean, 0/1 or the text "true".
fn flexible_bool<'de, D: Deserializer<'de>>(deserializer: D) -> Result<bool, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Flag {
        Bool(bool),
        Number(f64),
        Text(String),
    }
    Ok(match Option::<Flag>::deserialize(deserializer)? {
        Some(Flag::Bool(value)) => value,
        Some(Flag::Number(value)) => value != 0.0,
        Some(Flag::Text(value)) => value == "1" || value.eq_ignore_ascii_case("true"),
        None => false,
    })
}

impl LibraryFile {
    /// Rejects files that are not library exports or that come from a newer version of the app.
    pub fn validate(&self) -> AppResult<()> {
        if let Some(format) = &self.format
            && format != FORMAT_NAME
        {
            return Err(AppError::ImportFormat(format!("unknown format \"{format}\"")));
        }
        match self.format_version {
            Some(version) if version > FORMAT_VERSION => Err(AppError::ImportFormat(format!(
                "the file was created by a newer version of Mnemo (format {version})"
            ))),
            None if self.version.is_none() => Err(AppError::ImportFormat("missing format version".into())),
            _ => Ok(()),
        }
    }
}
