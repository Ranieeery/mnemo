//! Library export/import. Records keep the legacy snake_case column names so both formats share them.

use std::path::Path;

use rusqlite::{Connection, params};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};

use super::{hidden, layout, settings};
use crate::domain::folder_color::FolderColor;
use crate::domain::folder_name::{normalize_custom_name, normalize_group_name};
use crate::domain::folder_order::LibraryFolderSort;
use crate::domain::media::display_name;
use crate::domain::models::{AppSettings, ImportSummary};
use crate::domain::paths::is_within;
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
    pub settings: Option<AppSettings>,
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

fn select_all<T>(
    connection: &Connection,
    sql: &str,
    map: impl FnMut(&rusqlite::Row) -> rusqlite::Result<T>,
) -> AppResult<Vec<T>> {
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map([], map)?.collect::<Result<_, _>>()?;
    Ok(rows)
}

/// Reads the whole library into a version 2 file.
pub fn export(connection: &Connection) -> AppResult<LibraryFile> {
    let exported_at: String =
        connection.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now')", [], |row| row.get(0))?;
    Ok(LibraryFile {
        format: Some(FORMAT_NAME.to_owned()),
        format_version: Some(FORMAT_VERSION),
        version: None,
        app_version: Some(env!("CARGO_PKG_VERSION").to_owned()),
        exported_at: Some(exported_at),
        settings: Some(settings::load(connection)?),
        library_folder_sort: Some(settings::get::<settings::FolderSort>(connection)?),
        library_folders: select_all(
            connection,
            "SELECT id, path, created_at, custom_icon, icon_color, sort_order, custom_name, group_id
             FROM library_folders ORDER BY id",
            |row| {
                Ok(LibraryFolderRecord {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    created_at: row.get(2)?,
                    custom_icon: row.get(3)?,
                    icon_color: row.get(4)?,
                    sort_order: row.get(5)?,
                    custom_name: row.get(6)?,
                    group_id: row.get(7)?,
                })
            },
        )?,
        folder_settings: select_all(
            connection,
            "SELECT path, view_mode FROM folder_settings ORDER BY path",
            |row| {
                Ok(FolderSettingRecord {
                    path: row.get(0)?,
                    view_mode: row.get(1)?,
                })
            },
        )?,
        hidden_folders: hidden::list(connection)?,
        library_groups: select_all(
            connection,
            "SELECT id, name, sort_order, collapsed, created_at FROM library_groups ORDER BY id",
            |row| {
                Ok(LibraryGroupRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    sort_order: row.get(2)?,
                    collapsed: row.get::<_, i64>(3)? != 0,
                    created_at: row.get(4)?,
                })
            },
        )?,
        videos: select_all(
            connection,
            "SELECT id, file_path, title, description, duration_seconds, thumbnail_path, is_watched,
                    watch_progress_seconds, last_watched_at, created_at, updated_at
             FROM videos ORDER BY id",
            |row| {
                Ok(VideoRecord {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    title: row.get(2)?,
                    description: row.get(3)?,
                    duration_seconds: row.get(4)?,
                    thumbnail_path: row.get(5)?,
                    is_watched: row.get::<_, i64>(6)? != 0,
                    watch_progress_seconds: row.get(7)?,
                    last_watched_at: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            },
        )?,
        tags: select_all(connection, "SELECT id, name, created_at FROM tags ORDER BY id", |row| {
            Ok(TagRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?,
        video_tags: select_all(
            connection,
            "SELECT id, video_id, tag_id, created_at FROM video_tags ORDER BY id",
            |row| {
                Ok(VideoTagRecord {
                    id: row.get(0)?,
                    video_id: row.get(1)?,
                    tag_id: row.get(2)?,
                    created_at: row.get(3)?,
                })
            },
        )?,
        watch_history: select_all(
            connection,
            "SELECT id, video_id, watched_at, watch_duration_seconds FROM watch_history ORDER BY id",
            |row| {
                Ok(WatchHistoryRecord {
                    id: row.get(0)?,
                    video_id: row.get(1)?,
                    watched_at: row.get(2)?,
                    watch_duration_seconds: row.get(3)?,
                })
            },
        )?,
    })
}

/// Replaces the whole library with the file's contents in a single transaction: any failure leaves the current
/// library untouched. Settings are only replaced when the file carries them.
pub fn import(connection: &mut Connection, file: &LibraryFile) -> AppResult<ImportSummary> {
    file.validate()?;
    let transaction = connection.transaction()?;
    transaction.execute_batch(
        "DELETE FROM video_tags; DELETE FROM watch_history; DELETE FROM videos; DELETE FROM tags;
         DELETE FROM library_folders; DELETE FROM folder_settings; DELETE FROM hidden_folders;
         DELETE FROM library_groups;",
    )?;

    // A group whose name the app would refuse is left out, and its folders imported without a group.
    let mut imported_groups = Vec::new();
    for group in &file.library_groups {
        if let Ok(name) = normalize_group_name(&group.name) {
            transaction.execute(
                "INSERT INTO library_groups (id, name, sort_order, collapsed, created_at)
                 VALUES (?1, ?2, ?3, ?4, COALESCE(?5, CURRENT_TIMESTAMP))",
                params![
                    group.id,
                    name,
                    group.sort_order.unwrap_or(i64::MAX),
                    group.collapsed,
                    group.created_at
                ],
            )?;
            imported_groups.push(group.id);
        }
    }

    for folder in &file.library_folders {
        transaction.execute(
            "INSERT INTO library_folders (id, path, created_at, custom_icon, icon_color, sort_order, custom_name, group_id)
             VALUES (?1, ?2, COALESCE(?3, CURRENT_TIMESTAMP), ?4, ?5, ?6, ?7, ?8)",
            params![
                folder.id,
                folder.path,
                folder.created_at,
                folder.custom_icon,
                // A color this version does not know is imported as the default.
                folder
                    .icon_color
                    .as_deref()
                    .and_then(FolderColor::parse)
                    .map(FolderColor::as_str),
                // Items without a position go last; `layout::compact` then orders them by date added.
                folder.sort_order.unwrap_or(i64::MAX),
                // A name the app would refuse (too long, written by hand) is imported as none.
                folder.custom_name.as_deref().and_then(|name| {
                    normalize_custom_name(name, &display_name(Path::new(&folder.path)))
                        .ok()
                        .flatten()
                }),
                folder.group_id.filter(|id| imported_groups.contains(id))
            ],
        )?;
    }
    layout::compact(&transaction)?;
    for setting in &file.folder_settings {
        transaction.execute(
            "INSERT INTO folder_settings (path, view_mode) VALUES (?1, ?2)",
            params![setting.path, setting.view_mode],
        )?;
    }
    // A hidden folder outside the imported library could never be shown again: left out.
    for path in &file.hidden_folders {
        if file
            .library_folders
            .iter()
            .any(|folder| is_within(Path::new(path), Path::new(&folder.path)))
        {
            hidden::hide(&transaction, path)?;
        }
    }
    for tag in &file.tags {
        transaction.execute(
            "INSERT INTO tags (id, name, created_at) VALUES (?1, ?2, COALESCE(?3, CURRENT_TIMESTAMP))",
            params![tag.id, tag.name, tag.created_at],
        )?;
    }
    for video in &file.videos {
        transaction.execute(
            "INSERT INTO videos (id, file_path, title, description, duration_seconds, thumbnail_path, is_watched,
                                 watch_progress_seconds, last_watched_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, COALESCE(?10, CURRENT_TIMESTAMP),
                     COALESCE(?11, CURRENT_TIMESTAMP))",
            params![
                video.id,
                video.file_path,
                video.title,
                video.description,
                video.duration_seconds,
                video.thumbnail_path,
                video.is_watched,
                video.watch_progress_seconds.unwrap_or(0.0),
                video.last_watched_at,
                video.created_at,
                video.updated_at
            ],
        )?;
    }
    for video_tag in &file.video_tags {
        transaction.execute(
            "INSERT INTO video_tags (id, video_id, tag_id, created_at)
             VALUES (?1, ?2, ?3, COALESCE(?4, CURRENT_TIMESTAMP))",
            params![video_tag.id, video_tag.video_id, video_tag.tag_id, video_tag.created_at],
        )?;
    }
    for entry in &file.watch_history {
        transaction.execute(
            "INSERT INTO watch_history (id, video_id, watched_at, watch_duration_seconds)
             VALUES (?1, ?2, COALESCE(?3, CURRENT_TIMESTAMP), ?4)",
            params![
                entry.id,
                entry.video_id,
                entry.watched_at,
                entry.watch_duration_seconds.unwrap_or(0.0)
            ],
        )?;
    }
    if let Some(settings) = &file.settings {
        settings::save(&transaction, settings)?;
    }
    if let Some(sort) = file.library_folder_sort {
        settings::set::<settings::FolderSort>(&transaction, sort)?;
    }
    transaction.commit()?;

    Ok(ImportSummary {
        folders: file.library_folders.len() as i64,
        videos: file.videos.len() as i64,
        tags: file.tags.len() as i64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support;
    use crate::db::videos::tests::path;
    use crate::db::{folders, groups, tags, videos, watch};
    use crate::domain::folder_order::{flatten, library_entries};
    use crate::domain::models::LayoutEntry;

    /// Shape of a real export produced by the legacy frontend (`exportLibraryData` with `SELECT *`).
    const LEGACY_EXPORT: &str = r#"{
      "version": "1.0.0",
      "exportDate": "2025-06-01T12:00:00.000Z",
      "videos": [
        { "id": 1, "file_path": "D:\\Videos\\a.mkv", "title": "A", "description": null, "duration_seconds": 1200,
          "thumbnail_path": "C:\\thumbs\\a.jpg", "is_watched": 1, "watch_progress_seconds": 1100.5,
          "last_watched_at": "2025-05-01 10:00:00", "created_at": "2025-01-01 10:00:00",
          "updated_at": "2025-05-01 10:00:00" },
        { "id": 2, "file_path": "D:\\Videos\\b.mkv", "title": "B", "description": "notes", "duration_seconds": 600,
          "thumbnail_path": null, "is_watched": "false", "watch_progress_seconds": 0, "last_watched_at": null,
          "created_at": "2025-01-02 10:00:00", "updated_at": "2025-01-02 10:00:00" },
        { "id": 3, "file_path": "D:\\Videos\\c.mkv", "title": "C", "is_watched": true }
      ],
      "tags": [ { "id": 7, "name": "anime", "created_at": "2025-01-01 10:00:00" } ],
      "videoTags": [ { "id": 1, "video_id": 1, "tag_id": 7, "created_at": "2025-01-01 10:00:00" } ],
      "libraryFolders": [
        { "id": 1, "path": "D:\\Videos", "created_at": "2025-01-01 09:00:00", "custom_icon": "🎬" }
      ]
    }"#;

    fn parse(json: &str) -> LibraryFile {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn imports_a_legacy_export_with_every_boolean_shape() {
        // Regression (B6): `is_watched` was only restored when it was exactly `true`, and icons were dropped.
        let mut connection = test_support::connection();
        let summary = import(&mut connection, &parse(LEGACY_EXPORT)).unwrap();
        assert_eq!(
            summary,
            ImportSummary {
                folders: 1,
                videos: 3,
                tags: 1
            }
        );

        let watched: Vec<bool> = (1..=3)
            .map(|id| videos::get(&connection, id).unwrap().is_watched)
            .collect();
        assert_eq!(watched, vec![true, false, true]);
        assert_eq!(videos::get(&connection, 1).unwrap().watch_progress_seconds, 1100.5);
        assert_eq!(tags::for_video(&connection, 1).unwrap()[0].name, "anime");
        let folder = folders::list(&connection).unwrap().remove(0);
        assert_eq!(folder.custom_icon.as_deref(), Some("🎬"));
        // Exports from before 2.4 have no color: the default.
        assert_eq!(folder.icon_color, None);
    }

    #[test]
    fn icon_colors_are_exported_and_unknown_ones_import_as_the_default() {
        let mut source = test_support::connection();
        import(&mut source, &parse(LEGACY_EXPORT)).unwrap();
        folders::set_appearance(&source, "D:\\Videos", Some("tv"), Some(FolderColor::Violet)).unwrap();
        let mut exported = export(&source).unwrap();
        assert_eq!(exported.library_folders[0].icon_color.as_deref(), Some("violet"));

        let mut target = test_support::connection();
        import(&mut target, &parse(&serde_json::to_string(&exported).unwrap())).unwrap();
        assert_eq!(folders::list(&target).unwrap()[0].icon_color, Some(FolderColor::Violet));

        exported.library_folders[0].icon_color = Some("chartreuse".into());
        import(&mut target, &exported).unwrap();
        assert_eq!(folders::list(&target).unwrap()[0].icon_color, None);
    }

    #[test]
    fn custom_names_round_trip_and_older_or_invalid_ones_import_as_none() {
        let mut source = test_support::connection();
        import(&mut source, &parse(LEGACY_EXPORT)).unwrap();
        // Exports from before 2.5 have no custom name: the folder's own name.
        let legacy = folders::list(&source).unwrap().remove(0);
        assert_eq!((legacy.name, legacy.custom_name), (legacy.folder_name, None));
        let exported = export(&source).unwrap();
        assert!(!serde_json::to_string(&exported).unwrap().contains("custom_name"));

        folders::set_custom_name(&source, "D:\\Videos", Some("Movies")).unwrap();
        let mut exported = export(&source).unwrap();
        assert_eq!(exported.library_folders[0].custom_name.as_deref(), Some("Movies"));
        let mut target = test_support::connection();
        import(&mut target, &parse(&serde_json::to_string(&exported).unwrap())).unwrap();
        assert_eq!(folders::list(&target).unwrap()[0].name, "Movies");

        for invalid in [
            "   ",
            &"a".repeat(crate::domain::folder_name::MAX_FOLDER_NAME_CHARS + 1),
        ] {
            exported.library_folders[0].custom_name = Some(invalid.to_owned());
            import(&mut target, &exported).unwrap();
            assert_eq!(folders::list(&target).unwrap()[0].custom_name, None);
        }
        exported.library_folders[0].custom_name = Some("  Films\n".into());
        import(&mut target, &exported).unwrap();
        assert_eq!(folders::list(&target).unwrap()[0].custom_name.as_deref(), Some("Films"));
    }

    #[test]
    fn groups_round_trip_and_older_or_broken_ones_import_without_groups() {
        let mut source = test_support::connection();
        import(&mut source, &parse(LEGACY_EXPORT)).unwrap();
        // Exports from before 2.5 have no groups.
        assert!(groups::list(&source).unwrap().is_empty());
        assert_eq!(folders::list(&source).unwrap()[0].group_id, None);

        let courses = groups::create(&source, "Courses").unwrap();
        let series = groups::create(&source, "Series").unwrap();
        groups::set_collapsed(&source, series.id, true).unwrap();
        let folder = folders::list(&source).unwrap().remove(0);
        let other = folders::add(&source, "E:\\Other").unwrap();
        folders::move_to_group(&source, folder.id, Some(series.id)).unwrap();
        // Folders and groups mixed in the list.
        layout::write(
            &source,
            &[
                LayoutEntry::Group {
                    id: series.id,
                    folders: vec![folder.id],
                },
                LayoutEntry::Folder { id: other.id },
                LayoutEntry::Group {
                    id: courses.id,
                    folders: vec![],
                },
            ],
        )
        .unwrap();
        let mut exported = export(&source).unwrap();

        let mut target = test_support::connection();
        import(&mut target, &parse(&serde_json::to_string(&exported).unwrap())).unwrap();
        assert_eq!(groups::list(&target).unwrap(), groups::list(&source).unwrap());
        assert_eq!(layout::read(&target).unwrap(), layout::read(&source).unwrap());
        assert_eq!(folders::list(&target).unwrap()[0].group_id, Some(series.id));

        // A group the app would refuse is left out, and its folders come without a group.
        let series_record = exported
            .library_groups
            .iter_mut()
            .find(|group| group.id == series.id)
            .unwrap();
        series_record.name = "  ".into();
        import(&mut target, &exported).unwrap();
        assert_eq!(groups::list(&target).unwrap(), [courses]);
        assert_eq!(folders::list(&target).unwrap()[0].group_id, None);

        // So does a folder pointing at a group the file does not have.
        exported.library_folders[0].group_id = Some(999);
        import(&mut target, &exported).unwrap();
        assert_eq!(folders::list(&target).unwrap()[0].group_id, None);
    }

    /// The folders in the custom order.
    fn folder_paths(connection: &Connection) -> Vec<String> {
        let layout = layout::read(connection).unwrap();
        flatten(library_entries(
            &layout,
            folders::list(connection).unwrap(),
            groups::list(connection).unwrap(),
        ))
        .into_iter()
        .map(|folder| folder.path)
        .collect()
    }

    #[test]
    fn the_custom_order_and_the_sort_mode_round_trip() {
        let source = test_support::connection();
        let first = folders::add(&source, "A").unwrap().id;
        let second = folders::add(&source, "B").unwrap().id;
        let third = folders::add(&source, "C").unwrap().id;
        layout::write(&source, &[third, first, second].map(|id| LayoutEntry::Folder { id })).unwrap();
        settings::set::<settings::FolderSort>(&source, LibraryFolderSort::RecentlyWatched).unwrap();
        let exported = export(&source).unwrap();
        assert_eq!(exported.library_folder_sort, Some(LibraryFolderSort::RecentlyWatched));

        let mut target = test_support::connection();
        import(&mut target, &parse(&serde_json::to_string(&exported).unwrap())).unwrap();
        assert_eq!(folder_paths(&target), ["C", "A", "B"]);
        assert_eq!(
            settings::get::<settings::FolderSort>(&target).unwrap(),
            LibraryFolderSort::RecentlyWatched
        );
    }

    #[test]
    fn exports_without_an_order_or_a_mode_keep_the_previous_behavior() {
        let mut connection = test_support::connection();
        settings::set::<settings::FolderSort>(&connection, LibraryFolderSort::NameDescending).unwrap();
        let mut file = parse(LEGACY_EXPORT);
        file.library_folders = [
            (2, "E:\\Anime", "2025-02-01 09:00:00"),
            (1, "D:\\Videos", "2025-01-01 09:00:00"),
        ]
        .into_iter()
        .map(|(id, path, created_at)| LibraryFolderRecord {
            id,
            path: path.into(),
            created_at: Some(created_at.into()),
            custom_icon: None,
            icon_color: None,
            sort_order: None,
            custom_name: None,
            group_id: None,
        })
        .collect();
        import(&mut connection, &file).unwrap();
        // By date added, as they were listed before 2.4; the current mode is kept.
        assert_eq!(folder_paths(&connection), ["D:\\Videos", "E:\\Anime"]);
        assert_eq!(
            settings::get::<settings::FolderSort>(&connection).unwrap(),
            LibraryFolderSort::NameDescending
        );

        // Folders that have a position come first.
        file.library_folders[0].sort_order = Some(0);
        import(&mut connection, &file).unwrap();
        assert_eq!(folder_paths(&connection), ["E:\\Anime", "D:\\Videos"]);
    }

    #[test]
    fn an_unknown_sort_mode_is_ignored_on_import() {
        let json = LEGACY_EXPORT.replacen('{', r#"{ "libraryFolderSort": "bySize","#, 1);
        let file = parse(&json);
        assert_eq!(file.library_folder_sort, None);
        let mut connection = test_support::connection();
        import(&mut connection, &file).unwrap();
        assert_eq!(
            settings::get::<settings::FolderSort>(&connection).unwrap(),
            LibraryFolderSort::Custom
        );
    }

    #[test]
    fn export_then_import_round_trips_everything() {
        let mut source = test_support::connection();
        import(&mut source, &parse(LEGACY_EXPORT)).unwrap();
        watch::mark_watched(&mut source, 2).unwrap();
        folders::set_view_mode(
            &source,
            "D:\\Videos",
            Some(crate::domain::folder_view::FolderViewMode::Continuous),
        )
        .unwrap();
        settings::save(
            &source,
            &AppSettings {
                watched_threshold: 0.8,
                watch_folders: true,
            },
        )
        .unwrap();
        let exported = export(&source).unwrap();
        assert_eq!(exported.format_version, Some(FORMAT_VERSION));
        assert_eq!(exported.watch_history.len(), 1);

        let json = serde_json::to_string(&exported).unwrap();
        let mut target = test_support::connection();
        import(&mut target, &parse(&json)).unwrap();
        assert_eq!(export(&target).unwrap().videos, exported.videos);
        assert_eq!(export(&target).unwrap().watch_history, exported.watch_history);
        assert_eq!(folders::view_modes(&target).unwrap().len(), 1);
        assert_eq!(settings::load(&target).unwrap().watched_threshold, 0.8);
    }

    #[test]
    fn hidden_folders_round_trip_and_older_exports_hide_nothing() {
        let source = test_support::connection();
        folders::add(&source, &path(&["Lib"])).unwrap();
        hidden::hide(&source, &path(&["Lib", "Private"])).unwrap();
        let mut exported = export(&source).unwrap();
        assert_eq!(exported.hidden_folders, [path(&["Lib", "Private"])]);
        // Outside every imported library folder: left out.
        exported.hidden_folders.push(path(&["Elsewhere", "Private"]));

        let mut target = test_support::connection();
        import(&mut target, &parse(&serde_json::to_string(&exported).unwrap())).unwrap();
        assert_eq!(hidden::list(&target).unwrap(), [path(&["Lib", "Private"])]);

        import(&mut target, &parse(LEGACY_EXPORT)).unwrap();
        assert!(hidden::list(&target).unwrap().is_empty());
    }

    #[test]
    fn failed_import_keeps_the_current_library() {
        // Regression (B6): the legacy import deleted everything before inserting, so a failure lost the library.
        let mut connection = test_support::connection();
        import(&mut connection, &parse(LEGACY_EXPORT)).unwrap();
        let mut broken = parse(LEGACY_EXPORT);
        broken.video_tags[0].tag_id = 999;

        assert!(import(&mut connection, &broken).is_err());
        assert_eq!(export(&connection).unwrap().videos.len(), 3);
    }

    #[test]
    fn rejects_files_that_are_not_library_exports() {
        assert!(serde_json::from_str::<LibraryFile>(r#"{ "hello": "world" }"#).is_err());

        let mut newer = parse(LEGACY_EXPORT);
        newer.format_version = Some(FORMAT_VERSION + 1);
        assert!(matches!(newer.validate(), Err(AppError::ImportFormat(_))));

        let mut unversioned = parse(LEGACY_EXPORT);
        unversioned.version = None;
        assert!(matches!(unversioned.validate(), Err(AppError::ImportFormat(_))));

        let mut foreign = parse(LEGACY_EXPORT);
        foreign.format = Some("other-app".into());
        assert!(matches!(foreign.validate(), Err(AppError::ImportFormat(_))));
    }
}
