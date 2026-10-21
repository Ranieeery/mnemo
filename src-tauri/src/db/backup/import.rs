//! Replacing the library with a file's contents, one table at a time.

use std::path::Path;

use rusqlite::{Connection, params};

use super::format::{
    FolderSettingRecord, LibraryFile, LibraryFolderRecord, LibraryGroupRecord, TagRecord, VideoRecord, VideoTagRecord,
    WatchHistoryRecord,
};
use crate::db::{hidden, layout, settings};
use crate::domain::folder_color::FolderColor;
use crate::domain::folder_name::{normalize_custom_name, normalize_group_name};
use crate::domain::media::display_name;
use crate::domain::models::ImportSummary;
use crate::domain::paths::is_within;
use crate::error::AppResult;

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

    // Referenced rows go first: groups before folders, videos and tags before what links them.
    let imported_groups = import_groups(&transaction, &file.library_groups)?;
    import_folders(&transaction, &file.library_folders, &imported_groups)?;
    layout::compact(&transaction)?;
    import_folder_settings(&transaction, &file.folder_settings)?;
    import_hidden_folders(&transaction, &file.hidden_folders, &file.library_folders)?;
    import_tags(&transaction, &file.tags)?;
    import_videos(&transaction, &file.videos)?;
    import_video_tags(&transaction, &file.video_tags)?;
    import_watch_history(&transaction, &file.watch_history)?;
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

/// A group whose name the app would refuse is left out, and its folders imported without a group. Returns the ids
/// of the groups imported.
fn import_groups(connection: &Connection, groups: &[LibraryGroupRecord]) -> AppResult<Vec<i64>> {
    let mut imported = Vec::new();
    for group in groups {
        if let Ok(name) = normalize_group_name(&group.name) {
            connection.execute(
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
            imported.push(group.id);
        }
    }
    Ok(imported)
}

fn import_folders(connection: &Connection, folders: &[LibraryFolderRecord], imported_groups: &[i64]) -> AppResult<()> {
    for folder in folders {
        connection.execute(
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
    Ok(())
}

fn import_folder_settings(connection: &Connection, folder_settings: &[FolderSettingRecord]) -> AppResult<()> {
    for setting in folder_settings {
        connection.execute(
            "INSERT INTO folder_settings (path, view_mode) VALUES (?1, ?2)",
            params![setting.path, setting.view_mode],
        )?;
    }
    Ok(())
}

/// A hidden folder outside the imported library could never be shown again: left out.
fn import_hidden_folders(connection: &Connection, hidden: &[String], folders: &[LibraryFolderRecord]) -> AppResult<()> {
    for path in hidden {
        if folders
            .iter()
            .any(|folder| is_within(Path::new(path), Path::new(&folder.path)))
        {
            hidden::hide(connection, path)?;
        }
    }
    Ok(())
}

fn import_tags(connection: &Connection, tags: &[TagRecord]) -> AppResult<()> {
    for tag in tags {
        connection.execute(
            "INSERT INTO tags (id, name, created_at) VALUES (?1, ?2, COALESCE(?3, CURRENT_TIMESTAMP))",
            params![tag.id, tag.name, tag.created_at],
        )?;
    }
    Ok(())
}

fn import_videos(connection: &Connection, videos: &[VideoRecord]) -> AppResult<()> {
    for video in videos {
        connection.execute(
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
    Ok(())
}

fn import_video_tags(connection: &Connection, video_tags: &[VideoTagRecord]) -> AppResult<()> {
    for video_tag in video_tags {
        connection.execute(
            "INSERT INTO video_tags (id, video_id, tag_id, created_at)
             VALUES (?1, ?2, ?3, COALESCE(?4, CURRENT_TIMESTAMP))",
            params![video_tag.id, video_tag.video_id, video_tag.tag_id, video_tag.created_at],
        )?;
    }
    Ok(())
}

fn import_watch_history(connection: &Connection, history: &[WatchHistoryRecord]) -> AppResult<()> {
    for entry in history {
        connection.execute(
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
    Ok(())
}
