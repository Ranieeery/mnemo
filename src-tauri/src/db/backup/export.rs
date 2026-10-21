//! Reading the library into a file.

use rusqlite::Connection;

use super::format::{
    FORMAT_NAME, FORMAT_VERSION, FolderSettingRecord, LibraryFile, LibraryFolderRecord, LibraryGroupRecord, TagRecord,
    VideoRecord, VideoTagRecord, WatchHistoryRecord,
};
use crate::db::{hidden, settings};
use crate::error::AppResult;

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
                    collapsed: row.get(3)?,
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
                    is_watched: row.get(6)?,
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
