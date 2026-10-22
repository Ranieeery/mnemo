//! Replacing the library with a file's contents, one table at a time.

use std::collections::{HashMap, HashSet};
use std::path::Path;

use rusqlite::{Connection, params};

use super::format::{
    FolderSettingRecord, LibraryFile, LibraryFolderRecord, LibraryGroupRecord, SettingsRecord, TagRecord, VideoRecord,
    VideoTagRecord, WatchHistoryRecord,
};
use crate::db::{hidden, layout, settings};
use crate::domain::folder_color::FolderColor;
use crate::domain::folder_name::{normalize_custom_name, normalize_group_name};
use crate::domain::folder_view::FolderViewMode;
use crate::domain::media::display_name;
use crate::domain::models::ImportSummary;
use crate::domain::paths::is_within;
use crate::domain::tags::clean_tag_name;
use crate::error::AppResult;

/// Replaces the whole library with the file's contents in a single transaction: any failure leaves the current
/// library untouched. Settings are only replaced when the file carries them. Records the app would refuse (a file
/// edited by hand, or written by a newer version) are left out instead of failing the import.
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
    let tags = import_tags(&transaction, &file.tags)?;
    let videos = import_videos(&transaction, &file.videos)?;
    import_video_tags(&transaction, &file.video_tags, &videos, &tags)?;
    import_watch_history(&transaction, &file.watch_history, &videos)?;
    if let Some(settings) = &file.settings {
        import_settings(&transaction, settings)?;
    }
    if let Some(sort) = file.library_folder_sort {
        settings::set::<settings::FolderSort>(&transaction, sort)?;
    }
    transaction.commit()?;

    Ok(ImportSummary {
        folders: file.library_folders.len() as i64,
        videos: videos.len() as i64,
        tags: tags.values().collect::<HashSet<_>>().len() as i64,
    })
}

fn import_settings(connection: &Connection, record: &SettingsRecord) -> AppResult<()> {
    settings::set_or_default::<settings::WatchedThreshold>(connection, record.watched_threshold)?;
    settings::set_or_default::<settings::WatchFolders>(connection, record.watch_folders)?;
    Ok(())
}

/// A group whose name the app would refuse is left out, and its folders imported without a group. Returns the ids
/// of the groups imported.
fn import_groups(connection: &Connection, groups: &[LibraryGroupRecord]) -> AppResult<Vec<i64>> {
    let mut imported = Vec::new();
    for group in groups {
        if let Ok(name) = normalize_group_name(&group.name) {
            connection.execute(
                "INSERT INTO library_groups (id, name, sort_order, collapsed, created_at, pin_order)
                 VALUES (?1, ?2, ?3, ?4, COALESCE(?5, CURRENT_TIMESTAMP), ?6)",
                params![
                    group.id,
                    name,
                    group.sort_order.unwrap_or(i64::MAX),
                    group.collapsed,
                    group.created_at,
                    group.pin_order
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
            "INSERT INTO library_folders
                 (id, path, created_at, custom_icon, icon_color, sort_order, custom_name, group_id, pin_order)
             VALUES (?1, ?2, COALESCE(?3, CURRENT_TIMESTAMP), ?4, ?5, ?6, ?7, ?8, ?9)",
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
                folder.group_id.filter(|id| imported_groups.contains(id)),
                // `layout::compact` numbers the pins of each list again (a folder left without a group joins the
                // library's).
                folder.pin_order
            ],
        )?;
    }
    Ok(())
}

/// A view mode this version does not know is left out: the folder uses the default mode.
fn import_folder_settings(connection: &Connection, folder_settings: &[FolderSettingRecord]) -> AppResult<()> {
    let mut skipped = 0;
    for setting in folder_settings {
        let Some(mode) = FolderViewMode::parse(&setting.view_mode) else {
            skipped += 1;
            continue;
        };
        skipped += 1 - connection.execute(
            "INSERT INTO folder_settings (path, view_mode) VALUES (?1, ?2) ON CONFLICT DO NOTHING",
            params![setting.path, mode.as_str()],
        )?;
    }
    log_skipped("folder settings", skipped);
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

/// Names are stored the way the app stores them, so a file edited by hand cannot create a blank tag or two tags
/// that differ only in case: same-named tags become one. Returns where each file tag id ended up.
fn import_tags(connection: &Connection, tags: &[TagRecord]) -> AppResult<HashMap<i64, i64>> {
    let mut stored_ids = HashMap::new();
    let mut by_name = HashMap::new();
    for tag in tags {
        let name = clean_tag_name(&tag.name);
        if name.is_empty() {
            continue;
        }
        if let Some(&stored) = by_name.get(&name) {
            stored_ids.insert(tag.id, stored);
            continue;
        }
        let inserted = connection.execute(
            "INSERT INTO tags (id, name, created_at) VALUES (?1, ?2, COALESCE(?3, CURRENT_TIMESTAMP))
             ON CONFLICT DO NOTHING",
            params![tag.id, name, tag.created_at],
        )?;
        if inserted == 1 {
            stored_ids.insert(tag.id, tag.id);
            by_name.insert(name, tag.id);
        }
    }
    log_skipped("tags", tags.len() - stored_ids.len());
    Ok(stored_ids)
}

/// A video whose id or path repeats an earlier one is left out. Returns the ids of the videos imported.
fn import_videos(connection: &Connection, videos: &[VideoRecord]) -> AppResult<HashSet<i64>> {
    let mut imported = HashSet::new();
    for video in videos {
        let inserted = connection.execute(
            "INSERT INTO videos (id, file_path, title, description, duration_seconds, thumbnail_path, is_watched,
                                 watch_progress_seconds, last_watched_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, COALESCE(?10, CURRENT_TIMESTAMP),
                     COALESCE(?11, CURRENT_TIMESTAMP))
             ON CONFLICT DO NOTHING",
            params![
                video.id,
                video.file_path,
                video.title,
                video.description,
                video.duration_seconds,
                video.thumbnail_path,
                video.is_watched,
                video
                    .watch_progress_seconds
                    .filter(|seconds| seconds.is_finite())
                    .unwrap_or(0.0)
                    .max(0.0),
                video.last_watched_at,
                video.created_at,
                video.updated_at
            ],
        )?;
        if inserted == 1 {
            imported.insert(video.id);
        }
    }
    log_skipped("videos", videos.len() - imported.len());
    Ok(imported)
}

/// Links to a video or tag the file does not have, and repeated links, are left out.
fn import_video_tags(
    connection: &Connection,
    video_tags: &[VideoTagRecord],
    videos: &HashSet<i64>,
    tags: &HashMap<i64, i64>,
) -> AppResult<()> {
    let mut skipped = 0;
    for video_tag in video_tags {
        let Some(tag_id) = tags
            .get(&video_tag.tag_id)
            .filter(|_| videos.contains(&video_tag.video_id))
        else {
            skipped += 1;
            continue;
        };
        skipped += 1 - connection.execute(
            "INSERT INTO video_tags (id, video_id, tag_id, created_at)
             VALUES (?1, ?2, ?3, COALESCE(?4, CURRENT_TIMESTAMP))
             ON CONFLICT DO NOTHING",
            params![video_tag.id, video_tag.video_id, tag_id, video_tag.created_at],
        )?;
    }
    log_skipped("video tags", skipped);
    Ok(())
}

/// Entries of a video the file does not have, or with a time SQLite cannot read (it would break every history
/// page), are left out. Times are stored in the form the app writes them.
fn import_watch_history(
    connection: &Connection,
    history: &[WatchHistoryRecord],
    videos: &HashSet<i64>,
) -> AppResult<()> {
    let mut skipped = 0;
    for entry in history {
        if !videos.contains(&entry.video_id) {
            skipped += 1;
            continue;
        }
        skipped += 1 - connection.execute(
            "INSERT INTO watch_history (id, video_id, watched_at, watch_duration_seconds)
             SELECT ?1, ?2, COALESCE(datetime(?3), CURRENT_TIMESTAMP), ?4
             WHERE ?3 IS NULL OR datetime(?3) IS NOT NULL
             ON CONFLICT DO NOTHING",
            params![
                entry.id,
                entry.video_id,
                entry.watched_at,
                entry.watch_duration_seconds.unwrap_or(0.0)
            ],
        )?;
    }
    log_skipped("watch history entries", skipped);
    Ok(())
}

fn log_skipped(records: &str, count: usize) {
    if count > 0 {
        tracing::warn!(count, "left out {records} the library would not accept");
    }
}
