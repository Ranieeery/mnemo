//! Whether each video's file is still where the library expects it: file identity, renames and moves, and videos
//! whose file disappeared. A missing video keeps all its data and is hidden from the library until its file comes
//! back or it is cleaned up.

use rusqlite::{Connection, params, params_from_iter};

use super::videos::{COLUMNS, query_videos};
use crate::domain::media::FileIdentity;
use crate::domain::models::Video;
use crate::domain::paths::FolderBounds;
use crate::error::AppResult;

/// A stored video as the folder sync sees it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnownFile {
    pub id: i64,
    pub path: String,
    pub size: Option<i64>,
    pub fingerprint: Option<String>,
    pub missing: bool,
}

const KNOWN_COLUMNS: &str = "id, file_path, file_size, fingerprint, missing_since IS NOT NULL";

fn map_known(row: &rusqlite::Row) -> rusqlite::Result<KnownFile> {
    Ok(KnownFile {
        id: row.get(0)?,
        path: row.get(1)?,
        size: row.get(2)?,
        fingerprint: row.get(3)?,
        missing: row.get(4)?,
    })
}

/// The video stored at `path`, or every video inside it when it is a folder.
pub fn known_at(connection: &Connection, path: &str) -> AppResult<Vec<KnownFile>> {
    let bounds = FolderBounds::new(path);
    let mut statement = connection.prepare_cached(&format!(
        "SELECT {KNOWN_COLUMNS} FROM videos WHERE file_path = ?1 OR (file_path >= ?2 AND file_path < ?3)"
    ))?;
    let rows = statement
        .query_map(params![path, bounds.lower, bounds.upper], map_known)?
        .collect::<Result<_, _>>()?;
    Ok(rows)
}

/// Every video marked missing, wherever it is: a file that reappears elsewhere may be one of them.
pub fn missing(connection: &Connection) -> AppResult<Vec<KnownFile>> {
    let mut statement = connection.prepare_cached(&format!(
        "SELECT {KNOWN_COLUMNS} FROM videos WHERE missing_since IS NOT NULL"
    ))?;
    let rows = statement.query_map([], map_known)?.collect::<Result<_, _>>()?;
    Ok(rows)
}

/// Marks a video missing, keeping the date it was first noticed.
pub fn mark_missing(connection: &Connection, id: i64) -> AppResult<()> {
    connection.execute(
        "UPDATE videos SET missing_since = CURRENT_TIMESTAMP WHERE id = ?1 AND missing_since IS NULL",
        [id],
    )?;
    Ok(())
}

/// The file of a missing video is back where it was.
pub fn restore(connection: &Connection, id: i64) -> AppResult<()> {
    connection.execute("UPDATE videos SET missing_since = NULL WHERE id = ?1", [id])?;
    Ok(())
}

/// Moves a video to the file it was recognized in. Returns false, changing nothing, when another video is already
/// stored at `path` (read there meanwhile), so neither record is lost.
pub fn relocate(connection: &Connection, id: i64, path: &str, identity: &FileIdentity) -> AppResult<bool> {
    let changed = connection.execute(
        "UPDATE OR IGNORE videos
         SET file_path = ?2, file_size = ?3, fingerprint = ?4, missing_since = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![id, path, identity.size, identity.fingerprint],
    )?;
    Ok(changed == 1)
}

/// Follows a file renamed or moved while it was watched. Returns whether a video was stored at `from`.
pub fn rename_file(connection: &Connection, from: &str, to: &str) -> AppResult<bool> {
    let changed = connection.execute(
        "UPDATE OR IGNORE videos SET file_path = ?2, missing_since = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE file_path = ?1",
        params![from, to],
    )?;
    Ok(changed == 1)
}

/// Follows a folder renamed or moved while it was watched: every video inside it keeps its record. Returns how many
/// videos moved.
pub fn move_folder(connection: &Connection, from: &str, to: &str) -> AppResult<usize> {
    let source = FolderBounds::new(from);
    let target = FolderBounds::new(to);
    // `substr` counts characters, like `prefix_chars`.
    Ok(connection.execute(
        "UPDATE OR IGNORE videos SET file_path = ?3 || substr(file_path, ?4), updated_at = CURRENT_TIMESTAMP
         WHERE file_path >= ?1 AND file_path < ?2",
        params![
            source.lower,
            source.upper,
            target.lower,
            source.prefix_chars() as i64 + 1
        ],
    )?)
}

/// Stores the size of a video stored before sizes were kept, so a later rename can be recognized by it.
pub fn set_size(connection: &Connection, id: i64, size: i64) -> AppResult<()> {
    connection.execute("UPDATE videos SET file_size = ?2 WHERE id = ?1", params![id, size])?;
    Ok(())
}

pub fn set_identity(connection: &Connection, id: i64, identity: &FileIdentity) -> AppResult<()> {
    connection.execute(
        "UPDATE videos SET file_size = ?2, fingerprint = ?3 WHERE id = ?1",
        params![id, identity.size, identity.fingerprint],
    )?;
    Ok(())
}

/// Present videos whose file was never fingerprinted, by id after `after_id`, so a long backfill can go on in
/// batches and skip the files it could not read.
pub fn without_fingerprint(connection: &Connection, after_id: i64, limit: i64) -> AppResult<Vec<(i64, String)>> {
    let mut statement = connection.prepare_cached(
        "SELECT id, file_path FROM videos
         WHERE fingerprint IS NULL AND missing_since IS NULL AND id > ?1
         ORDER BY id LIMIT ?2",
    )?;
    let rows = statement
        .query_map(params![after_id, limit], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    Ok(rows)
}

/// The videos whose file is missing, longest missing first.
pub fn missing_videos(connection: &Connection) -> AppResult<Vec<Video>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM videos v WHERE v.missing_since IS NOT NULL ORDER BY v.missing_since, v.file_path"
    );
    query_videos(connection, &sql, [])
}

/// Deletes missing videos (tags and history cascade) and returns how many, with their thumbnail paths. Only those
/// inside `folders` and, with `older_than_days`, missing for longer than that.
pub fn delete_missing(
    connection: &Connection,
    folders: &[String],
    older_than_days: Option<i64>,
) -> AppResult<(usize, Vec<String>)> {
    if folders.is_empty() {
        return Ok((0, Vec::new()));
    }
    let mut values: Vec<String> = Vec::with_capacity(folders.len() * 2 + 1);
    let mut inside = Vec::with_capacity(folders.len());
    for folder in folders {
        let bounds = FolderBounds::new(folder);
        inside.push(format!(
            "(file_path >= ?{} AND file_path < ?{})",
            values.len() + 1,
            values.len() + 2
        ));
        values.push(bounds.lower);
        values.push(bounds.upper);
    }
    let age = match older_than_days {
        Some(days) => {
            values.push(format!("-{days} days"));
            format!("AND missing_since <= datetime('now', ?{})", values.len())
        }
        None => String::new(),
    };
    let sql = format!(
        "DELETE FROM videos WHERE missing_since IS NOT NULL {age} AND ({}) RETURNING thumbnail_path",
        inside.join(" OR ")
    );
    let mut statement = connection.prepare(&sql)?;
    let thumbnails = statement
        .query_map(params_from_iter(values), |row| row.get::<_, Option<String>>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok((thumbnails.len(), thumbnails.into_iter().flatten().collect()))
}

/// Whether the video stored at `path` is missing; `None` when nothing is stored there.
#[cfg(test)]
pub fn is_missing(connection: &Connection, path: &str) -> AppResult<Option<bool>> {
    use rusqlite::OptionalExtension;
    Ok(connection
        .query_row(
            "SELECT missing_since IS NOT NULL FROM videos WHERE file_path = ?1",
            [path],
            |row| row.get(0),
        )
        .optional()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::videos::tests::{add_video, path};
    use crate::db::{tags, test_support, videos};

    fn identity(size: i64) -> FileIdentity {
        FileIdentity {
            size,
            fingerprint: format!("{size:016x}"),
        }
    }

    #[test]
    fn lists_what_is_stored_at_a_file_or_inside_a_folder() {
        let connection = test_support::connection();
        let show = path(&["D:", "Show"]);
        add_video(&connection, &path(&["D:", "Show", "Ep 1.mkv"]), 60.0);
        add_video(&connection, &path(&["D:", "Show", "S2", "Ep 1.mkv"]), 60.0);
        add_video(&connection, &path(&["D:", "Show 2", "Ep 1.mkv"]), 60.0);

        assert_eq!(known_at(&connection, &show).unwrap().len(), 2);
        let file = known_at(&connection, &path(&["D:", "Show", "Ep 1.mkv"])).unwrap();
        assert_eq!(file.len(), 1);
        assert!(!file[0].missing);
    }

    #[test]
    fn a_missing_video_is_hidden_until_restored() {
        let connection = test_support::connection();
        let file = path(&["D:", "Show", "Ep 1.mkv"]);
        let video = add_video(&connection, &file, 60.0);

        mark_missing(&connection, video.id).unwrap();
        assert_eq!(is_missing(&connection, &file).unwrap(), Some(true));
        assert!(videos::search(&connection, "Ep", 10).unwrap().is_empty());
        assert_eq!(
            videos::stats_in_folder(&connection, &path(&["D:", "Show"]))
                .unwrap()
                .total_videos,
            0
        );
        assert_eq!(missing_videos(&connection).unwrap().len(), 1);
        assert_eq!(missing(&connection).unwrap()[0].id, video.id);

        restore(&connection, video.id).unwrap();
        assert_eq!(is_missing(&connection, &file).unwrap(), Some(false));
        assert_eq!(videos::search(&connection, "Ep", 10).unwrap().len(), 1);
    }

    #[test]
    fn relocating_keeps_the_record_and_never_overwrites_another() {
        let connection = test_support::connection();
        let video = add_video(&connection, &path(&["D:", "Old.mkv"]), 60.0);
        let tag = tags::create(&connection, "kept").unwrap();
        tags::add_to_video(&connection, video.id, tag.id).unwrap();
        mark_missing(&connection, video.id).unwrap();
        let other = add_video(&connection, &path(&["D:", "Taken.mkv"]), 60.0);

        assert!(!relocate(&connection, video.id, &other.file_path, &identity(10)).unwrap());
        assert!(relocate(&connection, video.id, &path(&["E:", "New.mkv"]), &identity(10)).unwrap());
        let moved = videos::get(&connection, video.id).unwrap();
        assert_eq!(moved.file_path, path(&["E:", "New.mkv"]));
        assert_eq!(tags::for_video(&connection, video.id).unwrap().len(), 1);
        assert_eq!(is_missing(&connection, &moved.file_path).unwrap(), Some(false));
    }

    #[test]
    fn renames_files_and_moves_folders_without_touching_siblings() {
        let connection = test_support::connection();
        let episode = add_video(&connection, &path(&["D:", "Show", "S1", "Ep 1.mkv"]), 60.0);
        let sibling = add_video(&connection, &path(&["D:", "Show 2", "Ep 1.mkv"]), 60.0);

        assert_eq!(
            move_folder(&connection, &path(&["D:", "Show"]), &path(&["D:", "Séries", "Show"])).unwrap(),
            1
        );
        let moved = path(&["D:", "Séries", "Show", "S1", "Ep 1.mkv"]);
        assert_eq!(videos::get(&connection, episode.id).unwrap().file_path, moved);
        assert_eq!(
            videos::get(&connection, sibling.id).unwrap().file_path,
            sibling.file_path
        );

        assert!(rename_file(&connection, &moved, &path(&["D:", "Pilot.mkv"])).unwrap());
        assert!(!rename_file(&connection, &moved, &path(&["D:", "Other.mkv"])).unwrap());
        assert_eq!(
            videos::get(&connection, episode.id).unwrap().file_path,
            path(&["D:", "Pilot.mkv"])
        );
    }

    #[test]
    fn backfill_lists_present_videos_without_a_fingerprint_in_batches() {
        let connection = test_support::connection();
        let first = add_video(&connection, &path(&["D:", "a.mkv"]), 60.0);
        let second = add_video(&connection, &path(&["D:", "b.mkv"]), 60.0);
        let gone = add_video(&connection, &path(&["D:", "c.mkv"]), 60.0);
        mark_missing(&connection, gone.id).unwrap();

        assert_eq!(
            without_fingerprint(&connection, 0, 1).unwrap(),
            vec![(first.id, first.file_path)]
        );
        set_identity(&connection, second.id, &identity(5)).unwrap();
        assert!(without_fingerprint(&connection, first.id, 10).unwrap().is_empty());
    }

    #[test]
    fn cleanup_deletes_only_missing_videos_inside_the_folders_and_old_enough() {
        let connection = test_support::connection();
        let library = path(&["D:", "Show"]);
        let old = add_video(&connection, &path(&["D:", "Show", "old.mkv"]), 60.0);
        let recent = add_video(&connection, &path(&["D:", "Show", "recent.mkv"]), 60.0);
        let present = add_video(&connection, &path(&["D:", "Show", "present.mkv"]), 60.0);
        let elsewhere = add_video(&connection, &path(&["E:", "old.mkv"]), 60.0);
        for video in [&old, &recent, &elsewhere] {
            mark_missing(&connection, video.id).unwrap();
        }
        connection
            .execute(
                "UPDATE videos SET missing_since = datetime('now', '-31 days') WHERE id IN (?1, ?2)",
                [old.id, elsewhere.id],
            )
            .unwrap();

        assert_eq!(
            delete_missing(&connection, std::slice::from_ref(&library), Some(30)).unwrap(),
            (1, vec!["thumb.jpg".to_owned()])
        );
        assert!(videos::find_by_id(&connection, old.id).unwrap().is_none());
        assert!(videos::find_by_id(&connection, elsewhere.id).unwrap().is_some());

        assert_eq!(delete_missing(&connection, &[library], None).unwrap().0, 1);
        assert!(videos::find_by_id(&connection, recent.id).unwrap().is_none());
        assert!(videos::find_by_id(&connection, present.id).unwrap().is_some());
    }
}
