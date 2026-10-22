use std::path::{Path, PathBuf};

use rusqlite::types::Value;
use rusqlite::{Connection, OptionalExtension, Row, params, params_from_iter};

use super::hidden::VISIBLE;
use super::like_pattern;
use crate::domain::media::FileIdentity;
use crate::domain::models::{FolderStats, Video};
use crate::domain::natural_order::ReadingKey;
use crate::domain::paths::FolderBounds;
use crate::error::{AppError, AppResult};

pub(super) const COLUMNS: &str = "v.id, v.file_path, v.title, v.description, v.duration_seconds, v.thumbnail_path, v.is_watched, \
                       v.watch_progress_seconds, v.last_watched_at, v.created_at, v.updated_at";

pub(super) fn map_row(row: &Row) -> rusqlite::Result<Video> {
    Ok(Video {
        id: row.get(0)?,
        file_path: row.get(1)?,
        title: row.get(2)?,
        description: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
        duration_seconds: row.get::<_, Option<f64>>(4)?.unwrap_or(0.0),
        thumbnail_path: row.get::<_, Option<String>>(5)?.filter(|path| !path.is_empty()),
        is_watched: read_flag(row.get(6)?),
        watch_progress_seconds: row.get::<_, Option<f64>>(7)?.unwrap_or(0.0),
        last_watched_at: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

/// Reads `is_watched` tolerating text booleans: migrations turn the ones left by the legacy SQL plugin into integers,
/// but a 1.x build opened on the same file afterwards can write them again.
fn read_flag(value: Value) -> bool {
    match value {
        Value::Integer(number) => number != 0,
        Value::Real(number) => number != 0.0,
        Value::Text(text) => text == "1" || text.eq_ignore_ascii_case("true"),
        Value::Null | Value::Blob(_) => false,
    }
}

/// SQL condition (over `v.file_path`) that is true for videos inside any of the given folders, with its parameters
/// (`?1` onwards).
pub(super) fn inside_any(folders: &[String]) -> (String, Vec<String>) {
    let mut values = Vec::new();
    let condition = range_condition("v.file_path", folders, false, &mut values);
    (condition, values)
}

/// SQL condition (over the path `column`) that is true for `folder` and everything inside it, except the `kept`
/// folders and everything inside them, with its parameters (`?1` onwards).
pub(super) fn within_except(column: &str, folder: &str, kept: &[String]) -> (String, Vec<String>) {
    let mut values = Vec::new();
    let within = range_condition(column, &[folder.to_owned()], true, &mut values);
    let in_kept = range_condition(column, kept, true, &mut values);
    (format!("({within} AND NOT {in_kept})"), values)
}

/// Appends the parameters of the condition to `values`, numbering them after those already there.
fn range_condition(column: &str, folders: &[String], with_folder_itself: bool, values: &mut Vec<String>) -> String {
    if folders.is_empty() {
        return "0".to_owned();
    }
    let mut conditions = Vec::with_capacity(folders.len());
    for folder in folders {
        let bounds = FolderBounds::new(folder);
        let mut condition = format!(
            "({column} >= ?{} AND {column} < ?{})",
            values.len() + 1,
            values.len() + 2
        );
        values.extend([bounds.lower, bounds.upper]);
        if with_folder_itself {
            values.push(folder.clone());
            condition = format!("({column} = ?{} OR {condition})", values.len());
        }
        conditions.push(condition);
    }
    format!("({})", conditions.join(" OR "))
}

pub(super) fn query_videos(connection: &Connection, sql: &str, params: impl rusqlite::Params) -> AppResult<Vec<Video>> {
    let mut statement = connection.prepare_cached(sql)?;
    let videos = statement.query_map(params, map_row)?.collect::<Result<_, _>>()?;
    Ok(videos)
}

pub fn find_by_id(connection: &Connection, id: i64) -> AppResult<Option<Video>> {
    let sql = format!("SELECT {COLUMNS} FROM videos v WHERE v.id = ?1");
    Ok(connection.query_row(&sql, [id], map_row).optional()?)
}

pub fn get(connection: &Connection, id: i64) -> AppResult<Video> {
    find_by_id(connection, id)?.ok_or_else(|| AppError::NotFound(format!("video {id}")))
}

pub fn find_by_path(connection: &Connection, file_path: &str) -> AppResult<Option<Video>> {
    let sql = format!("SELECT {COLUMNS} FROM videos v WHERE v.file_path = ?1");
    Ok(connection.query_row(&sql, [file_path], map_row).optional()?)
}

/// How many of `paths` are stored videos, and the others.
pub fn split_stored(connection: &Connection, paths: Vec<PathBuf>) -> AppResult<(usize, Vec<PathBuf>)> {
    let mut statement = connection.prepare_cached("SELECT 1 FROM videos WHERE file_path = ?1")?;
    let total = paths.len();
    let mut new = Vec::new();
    for path in paths {
        if !statement.exists([path.to_string_lossy()])? {
            new.push(path);
        }
    }
    Ok((total - new.len(), new))
}

pub struct NewVideo<'a> {
    pub file_path: &'a str,
    pub title: &'a str,
    pub duration_seconds: f64,
    pub thumbnail_path: Option<&'a str>,
    /// Recognizes the file after a rename or move; unknown when it could not be read.
    pub identity: Option<&'a FileIdentity>,
}

const INSERT: &str = "INSERT INTO videos (file_path, title, duration_seconds, thumbnail_path, file_size, fingerprint,
                                          is_watched, watch_progress_seconds)
                      VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0)
                      ON CONFLICT (file_path) DO NOTHING";

/// Runs [`INSERT`] for one video; returns 0 when a video was already stored under its path.
fn execute_insert(statement: &mut rusqlite::CachedStatement, video: &NewVideo) -> rusqlite::Result<usize> {
    statement.execute(params![
        video.file_path,
        video.title,
        video.duration_seconds.round(),
        video.thumbnail_path,
        video.identity.map(|identity| identity.size),
        video.identity.map(|identity| identity.fingerprint.as_str()),
    ])
}

/// Inserts a processed video. A video already stored under the same path is kept as is and returned. The pipeline
/// stores videos with [`insert_batch`]; this one sets up test data.
#[cfg(test)]
pub fn insert(connection: &Connection, video: &NewVideo) -> AppResult<Video> {
    execute_insert(&mut connection.prepare_cached(INSERT)?, video)?;
    find_by_path(connection, video.file_path)?.ok_or_else(|| AppError::NotFound(video.file_path.to_owned()))
}

/// Inserts processed videos in one transaction. Returns, for each, whether it was new: a video already stored under
/// the same path (read meanwhile by another job) is kept as is, so running a batch twice changes nothing.
pub fn insert_batch(connection: &mut Connection, videos: &[NewVideo]) -> AppResult<Vec<bool>> {
    let transaction = connection.transaction()?;
    let mut inserted = Vec::with_capacity(videos.len());
    {
        let mut statement = transaction.prepare_cached(INSERT)?;
        for video in videos {
            inserted.push(execute_insert(&mut statement, video)? == 1);
        }
    }
    transaction.commit()?;
    Ok(inserted)
}

/// Every thumbnail file the library uses.
pub fn thumbnail_paths(connection: &Connection) -> AppResult<Vec<String>> {
    let mut statement = connection.prepare("SELECT thumbnail_path FROM videos WHERE thumbnail_path IS NOT NULL")?;
    let paths = statement.query_map([], |row| row.get(0))?.collect::<Result<_, _>>()?;
    Ok(paths)
}

/// Videos inside `folder`, ordered by path. With `recursive == false` only the folder's direct children.
pub fn in_folder(connection: &Connection, folder: &str, recursive: bool) -> AppResult<Vec<Video>> {
    let bounds = FolderBounds::new(folder);
    if recursive {
        let sql =
            format!("SELECT {COLUMNS} FROM videos v WHERE v.file_path >= ?1 AND v.file_path < ?2 ORDER BY v.file_path");
        query_videos(connection, &sql, params![bounds.lower, bounds.upper])
    } else {
        // A direct child has no separator after the folder prefix.
        let sql = format!(
            "SELECT {COLUMNS} FROM videos v
             WHERE v.file_path >= ?1 AND v.file_path < ?2
               AND instr(substr(v.file_path, ?3), '/') = 0 AND instr(substr(v.file_path, ?3), '\\') = 0
             ORDER BY v.file_path"
        );
        let first_child_char = bounds.prefix_chars() as i64 + 1;
        query_videos(connection, &sql, params![bounds.lower, bounds.upper, first_child_char])
    }
}

pub fn stats_in_folder(connection: &Connection, folder: &str) -> AppResult<FolderStats> {
    let bounds = FolderBounds::new(folder);
    let (total, watched) = connection.query_row(
        "SELECT COUNT(*), COALESCE(SUM(is_watched = 1), 0) FROM videos
         WHERE file_path >= ?1 AND file_path < ?2 AND missing_since IS NULL",
        params![bounds.lower, bounds.upper],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    Ok(FolderStats {
        total_videos: total,
        watched_videos: watched,
    })
}

pub fn tagged_count_in_folder(connection: &Connection, folder: &str) -> AppResult<i64> {
    let bounds = FolderBounds::new(folder);
    Ok(connection.query_row(
        "SELECT COUNT(DISTINCT v.id) FROM videos v JOIN video_tags vt ON vt.video_id = v.id
         WHERE v.file_path >= ?1 AND v.file_path < ?2 AND v.missing_since IS NULL",
        params![bounds.lower, bounds.upper],
        |row| row.get(0),
    )?)
}

/// A few videos of a library folder for the home page: not started first, then in progress, then watched, each in
/// the reading order of the continuous view. SQLite has no natural order, so only the keys of the folder's videos are
/// sorted here, and the full records are read for the `limit` that make it.
pub fn folder_preview(connection: &Connection, folder: &str, limit: i64) -> AppResult<Vec<Video>> {
    let bounds = FolderBounds::new(folder);
    let sql = format!(
        "SELECT CASE
                  WHEN v.is_watched = 1 THEN 2
                  WHEN v.watch_progress_seconds > 0 THEN 1
                  ELSE 0
                END,
                v.file_path, v.id
         FROM videos v
         WHERE v.file_path >= ?1 AND v.file_path < ?2 AND v.missing_since IS NULL AND {VISIBLE}"
    );
    let mut statement = connection.prepare_cached(&sql)?;
    let mut keys = statement
        .query_map(params![bounds.lower, bounds.upper], |row| {
            let key = (
                row.get::<_, i64>(0)?,
                ReadingKey::new(Path::new(&row.get::<_, String>(1)?)),
            );
            Ok((key, row.get::<_, i64>(2)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    // Only the first `limit` need an order: set them apart, then sort just those.
    let limit = usize::try_from(limit).unwrap_or(0).min(keys.len());
    if limit < keys.len() {
        keys.select_nth_unstable(limit);
        keys.truncate(limit);
    }
    keys.sort_unstable();
    keys.into_iter().map(|(_, id)| get(connection, id)).collect()
}

pub fn continue_watching(connection: &Connection, limit: i64) -> AppResult<Vec<Video>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM videos v
         WHERE v.watch_progress_seconds > 0 AND v.is_watched = 0 AND v.missing_since IS NULL AND {VISIBLE}
         ORDER BY v.last_watched_at DESC LIMIT ?1"
    );
    query_videos(connection, &sql, [limit])
}

pub fn recently_watched(connection: &Connection, limit: i64) -> AppResult<Vec<Video>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM videos v WHERE v.last_watched_at IS NOT NULL AND v.missing_since IS NULL AND {VISIBLE}
         ORDER BY v.last_watched_at DESC LIMIT ?1"
    );
    query_videos(connection, &sql, [limit])
}

pub fn suggestions(connection: &Connection, limit: i64) -> AppResult<Vec<Video>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM videos v
         WHERE v.is_watched = 0 AND v.watch_progress_seconds = 0 AND v.missing_since IS NULL AND {VISIBLE}
         ORDER BY v.created_at DESC LIMIT ?1"
    );
    query_videos(connection, &sql, [limit])
}

/// Library search by title, description or tag name.
pub fn search(connection: &Connection, query: &str, limit: i64) -> AppResult<Vec<Video>> {
    let sql = format!(
        "SELECT DISTINCT {COLUMNS} FROM videos v
         LEFT JOIN video_tags vt ON vt.video_id = v.id
         LEFT JOIN tags t ON t.id = vt.tag_id
         WHERE v.missing_since IS NULL AND {VISIBLE}
           AND (v.title LIKE ?1 ESCAPE '\\' OR v.description LIKE ?1 ESCAPE '\\' OR t.name LIKE ?1 ESCAPE '\\')
         ORDER BY v.title
         LIMIT ?2"
    );
    query_videos(connection, &sql, params![like_pattern(query.trim()), limit])
}

pub fn update_details(connection: &Connection, id: i64, title: &str, description: &str) -> AppResult<Video> {
    let changed = connection.execute(
        "UPDATE videos SET title = ?2, description = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![id, title, description],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("video {id}")));
    }
    get(connection, id)
}

pub fn set_thumbnail(connection: &Connection, id: i64, thumbnail_path: &str) -> AppResult<Video> {
    let changed = connection.execute(
        "UPDATE videos SET thumbnail_path = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![id, thumbnail_path],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("video {id}")));
    }
    get(connection, id)
}

/// Deletes every video inside `folder` except those inside the `kept` folders (tags and history cascade). Returns how
/// many were deleted, with their thumbnail paths.
pub fn delete_in_folder(connection: &Connection, folder: &str, kept: &[String]) -> AppResult<(usize, Vec<String>)> {
    let (condition, values) = within_except("file_path", folder, kept);
    let mut statement = connection.prepare(&format!(
        "DELETE FROM videos WHERE {condition} RETURNING thumbnail_path"
    ))?;
    let thumbnails = statement
        .query_map(params_from_iter(values), |row| row.get::<_, Option<String>>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok((thumbnails.len(), thumbnails.into_iter().flatten().collect()))
}

#[cfg(test)]
pub(crate) mod tests {
    use std::path::MAIN_SEPARATOR_STR;

    use super::*;
    use crate::db::{hidden, presence, test_support, watch};

    pub fn path(parts: &[&str]) -> String {
        parts.join(MAIN_SEPARATOR_STR)
    }

    pub fn add_video(connection: &Connection, file_path: &str, duration: f64) -> Video {
        insert(
            connection,
            &NewVideo {
                file_path,
                title: file_path,
                duration_seconds: duration,
                thumbnail_path: Some("thumb.jpg"),
                identity: None,
            },
        )
        .unwrap()
    }

    pub fn paths(videos: &[Video]) -> Vec<String> {
        videos.iter().map(|video| video.file_path.clone()).collect()
    }

    #[test]
    fn inserts_a_batch_once_even_when_run_again() {
        let mut connection = test_support::connection();
        let batch = [
            NewVideo {
                file_path: "D:\\a.mkv",
                title: "a",
                duration_seconds: 60.0,
                thumbnail_path: None,
                identity: None,
            },
            NewVideo {
                file_path: "D:\\b.mkv",
                title: "b",
                duration_seconds: 90.0,
                thumbnail_path: Some("b.jpg"),
                identity: None,
            },
        ];
        assert_eq!(insert_batch(&mut connection, &batch).unwrap(), [true, true]);
        assert_eq!(insert_batch(&mut connection, &batch).unwrap(), [false, false]);
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM videos", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn insert_keeps_an_existing_record() {
        let connection = test_support::connection();
        let first = add_video(&connection, "a.mkv", 100.0);
        let again = insert(
            &connection,
            &NewVideo {
                file_path: "a.mkv",
                title: "other",
                duration_seconds: 5.0,
                thumbnail_path: None,
                identity: None,
            },
        )
        .unwrap();
        assert_eq!(again, first);
    }

    #[test]
    fn folder_filters_ignore_siblings_with_shared_prefix() {
        // Regression (B5): `LIKE 'Show%'` used to match `Show 2`.
        let connection = test_support::connection();
        add_video(&connection, &path(&["Show", "e1.mkv"]), 10.0);
        add_video(&connection, &path(&["Show", "Season 2", "e2.mkv"]), 10.0);
        add_video(&connection, &path(&["Show 2", "e1.mkv"]), 10.0);
        add_video(&connection, &path(&["Show_", "e1.mkv"]), 10.0);

        let recursive = in_folder(&connection, "Show", true).unwrap();
        assert_eq!(
            paths(&recursive),
            vec![path(&["Show", "Season 2", "e2.mkv"]), path(&["Show", "e1.mkv"])]
        );
        let direct = in_folder(&connection, "Show", false).unwrap();
        assert_eq!(paths(&direct), vec![path(&["Show", "e1.mkv"])]);
        assert_eq!(stats_in_folder(&connection, "Show").unwrap().total_videos, 2);
    }

    #[test]
    fn missing_video_is_not_found() {
        let mut connection = test_support::connection();
        assert!(matches!(
            watch::mark_watched(&mut connection, 42),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            update_details(&connection, 42, "t", "d"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn home_lists_follow_watch_state() {
        let mut connection = test_support::connection();
        let started = add_video(&connection, "started.mkv", 100.0);
        let watched = add_video(&connection, "watched.mkv", 100.0);
        add_video(&connection, "new.mkv", 100.0);
        watch::save_progress(&mut connection, started.id, 10.0, 0.9, false).unwrap();
        watch::mark_watched(&mut connection, watched.id).unwrap();

        assert_eq!(paths(&continue_watching(&connection, 10).unwrap()), vec!["started.mkv"]);
        assert_eq!(paths(&suggestions(&connection, 10).unwrap()), vec!["new.mkv"]);
        assert_eq!(recently_watched(&connection, 10).unwrap().len(), 2);
    }

    #[test]
    fn folder_preview_puts_unstarted_videos_first() {
        let mut connection = test_support::connection();
        let watched = add_video(&connection, &path(&["F", "a.mkv"]), 100.0);
        let started = add_video(&connection, &path(&["F", "b.mkv"]), 100.0);
        add_video(&connection, &path(&["F", "c.mkv"]), 100.0);
        watch::mark_watched(&mut connection, watched.id).unwrap();
        watch::save_progress(&mut connection, started.id, 10.0, 0.9, false).unwrap();

        let preview = folder_preview(&connection, "F", 5).unwrap();
        assert_eq!(
            paths(&preview),
            vec![path(&["F", "c.mkv"]), path(&["F", "b.mkv"]), path(&["F", "a.mkv"])]
        );
        assert_eq!(folder_preview(&connection, "F", 1).unwrap().len(), 1);
    }

    /// The `Lib` library folder, its tree added in no particular order, each video titled by its file name the way
    /// the pipeline does (titles alone sort `Video 1` of every folder together).
    fn course_library(connection: &Connection) -> Vec<Video> {
        let files: [&[&str]; 10] = [
            &["Course 2", "Video 1.mkv"],
            &["Course", "Module 2", "Video 1.mkv"],
            &["Course_", "Video 1.mkv"],
            &["Course", "Video 10.mkv"],
            &["Course", "Module 1", "Video 2.mkv"],
            &["Root 10.mkv"],
            &["Course", "Module 1", "Video 1.mkv"],
            &["Course", "Video 2.mkv"],
            &["Root 2.mkv"],
            &["Course", "Module 1", "Video 10.mkv"],
        ];
        add_video(connection, &path(&["Lib 2", "Video 1.mkv"]), 10.0);
        files
            .iter()
            .map(|parts| {
                let video = add_video(connection, &lib(parts), 10.0);
                let name = parts.last().unwrap().trim_end_matches(".mkv");
                update_details(connection, video.id, name, "").unwrap()
            })
            .collect()
    }

    fn lib(parts: &[&str]) -> String {
        path(&[&["Lib"], parts].concat())
    }

    /// The reading order of [`course_library`].
    fn course_tree() -> Vec<String> {
        [
            &["Root 2.mkv"][..],
            &["Root 10.mkv"],
            &["Course", "Video 2.mkv"],
            &["Course", "Video 10.mkv"],
            &["Course", "Module 1", "Video 1.mkv"],
            &["Course", "Module 1", "Video 2.mkv"],
            &["Course", "Module 1", "Video 10.mkv"],
            &["Course", "Module 2", "Video 1.mkv"],
            &["Course 2", "Video 1.mkv"],
            &["Course_", "Video 1.mkv"],
        ]
        .iter()
        .map(|parts| lib(parts))
        .collect()
    }

    #[test]
    fn folder_preview_reads_the_tree_folder_by_folder() {
        // Regression: the preview sorted by title, interleaving the videos of sibling folders.
        let connection = test_support::connection();
        course_library(&connection);
        assert_eq!(paths(&folder_preview(&connection, "Lib", 50).unwrap()), course_tree());
    }

    #[test]
    fn folder_preview_shows_the_next_videos_of_each_status_in_tree_order() {
        let mut connection = test_support::connection();
        let videos = course_library(&connection);
        let id_of = |parts: &[&str]| videos.iter().find(|video| video.file_path == lib(parts)).unwrap().id;
        assert_eq!(
            paths(&folder_preview(&connection, "Lib", 3).unwrap()),
            course_tree()[..3].to_vec()
        );

        watch::mark_watched(&mut connection, id_of(&["Root 2.mkv"])).unwrap();
        watch::mark_watched(&mut connection, id_of(&["Root 10.mkv"])).unwrap();
        watch::save_progress(&mut connection, id_of(&["Course 2", "Video 1.mkv"]), 5.0, 0.9, false).unwrap();
        watch::save_progress(&mut connection, id_of(&["Course", "Video 2.mkv"]), 5.0, 0.9, false).unwrap();
        let tree = course_tree();
        let expected = [&tree[3..8], &tree[9..], &[tree[2].clone(), tree[8].clone()], &tree[..2]].concat();
        assert_eq!(paths(&folder_preview(&connection, "Lib", 50).unwrap()), expected);
        assert_eq!(
            paths(&folder_preview(&connection, "Lib", 3).unwrap()),
            tree[3..6].to_vec()
        );
    }

    #[test]
    fn folder_preview_leaves_out_missing_videos_and_hidden_folders() {
        let connection = test_support::connection();
        let videos = course_library(&connection);
        let missing = videos
            .iter()
            .find(|video| video.file_path == lib(&["Root 2.mkv"]))
            .unwrap();
        presence::mark_missing(&connection, missing.id).unwrap();
        hidden::hide(&connection, &lib(&["Course", "Module 1"])).unwrap();

        let tree = course_tree();
        let expected = [&tree[1..4], &tree[7..]].concat();
        assert_eq!(paths(&folder_preview(&connection, "Lib", 50).unwrap()), expected);
    }

    #[test]
    fn search_matches_title_description_and_tags_literally() {
        let connection = test_support::connection();
        let tagged = add_video(&connection, "tagged.mkv", 1.0);
        let described = add_video(&connection, "described.mkv", 1.0);
        add_video(&connection, "100% real.mkv", 1.0);
        update_details(&connection, described.id, "Plain", "a documentary").unwrap();
        connection
            .execute("INSERT INTO tags (id, name) VALUES (1, 'docs')", [])
            .unwrap();
        connection
            .execute("INSERT INTO video_tags (video_id, tag_id) VALUES (?1, 1)", [tagged.id])
            .unwrap();

        assert_eq!(search(&connection, "doc", 10).unwrap().len(), 2);
        assert_eq!(paths(&search(&connection, "100%", 10).unwrap()), vec!["100% real.mkv"]);
        assert!(search(&connection, "_", 10).unwrap().is_empty());
    }

    #[test]
    fn deleting_a_folder_cascades_and_returns_thumbnails() {
        let mut connection = test_support::connection();
        let video = add_video(&connection, &path(&["F", "a.mkv"]), 100.0);
        add_video(&connection, &path(&["G", "b.mkv"]), 100.0);
        watch::mark_watched(&mut connection, video.id).unwrap();
        connection
            .execute("INSERT INTO tags (id, name) VALUES (1, 't')", [])
            .unwrap();
        connection
            .execute("INSERT INTO video_tags (video_id, tag_id) VALUES (?1, 1)", [video.id])
            .unwrap();

        assert_eq!(
            delete_in_folder(&connection, "F", &[]).unwrap(),
            (1, vec!["thumb.jpg".to_owned()])
        );
        let remaining: (i64, i64, i64) = connection
            .query_row(
                "SELECT (SELECT COUNT(*) FROM videos), (SELECT COUNT(*) FROM video_tags),
                        (SELECT COUNT(*) FROM watch_history)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(remaining, (1, 0, 0));
    }

    #[test]
    fn reads_text_booleans_left_by_the_legacy_plugin() {
        let connection = test_support::connection();
        let video = add_video(&connection, "a.mkv", 1.0);
        connection
            .execute("UPDATE videos SET is_watched = 'true' WHERE id = ?1", [video.id])
            .unwrap();
        assert!(get(&connection, video.id).unwrap().is_watched);
        connection
            .execute("UPDATE videos SET is_watched = 'false' WHERE id = ?1", [video.id])
            .unwrap();
        assert!(!get(&connection, video.id).unwrap().is_watched);
    }
}
