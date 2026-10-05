//! Videos that belong to no library folder, and library-wide totals.

use rusqlite::{Connection, params_from_iter};

use super::videos::{COLUMNS, query_videos};
use crate::domain::models::Video;
use crate::domain::paths::FolderBounds;
use crate::error::AppResult;

/// SQL condition (over `v.file_path`) that is true for videos inside any of the given folders.
fn inside_any(folders: &[String]) -> (String, Vec<String>) {
    if folders.is_empty() {
        return ("0".to_owned(), Vec::new());
    }
    let mut conditions = Vec::with_capacity(folders.len());
    let mut values = Vec::with_capacity(folders.len() * 2);
    for folder in folders {
        let bounds = FolderBounds::new(folder);
        conditions.push(format!(
            "(v.file_path >= ?{} AND v.file_path < ?{})",
            values.len() + 1,
            values.len() + 2
        ));
        values.push(bounds.lower);
        values.push(bounds.upper);
    }
    (format!("({})", conditions.join(" OR ")), values)
}

/// Videos that do not belong to any library folder (their folder was removed by an old version).
pub fn orphans(connection: &Connection, library_folders: &[String]) -> AppResult<Vec<Video>> {
    let (inside, values) = inside_any(library_folders);
    let sql = format!("SELECT {COLUMNS} FROM videos v WHERE NOT {inside} ORDER BY v.file_path");
    query_videos(connection, &sql, params_from_iter(values))
}

/// Deletes the orphaned videos and returns their thumbnail paths.
pub fn delete_orphans(connection: &Connection, library_folders: &[String]) -> AppResult<Vec<String>> {
    let (inside, values) = inside_any(library_folders);
    let sql = format!("DELETE FROM videos AS v WHERE NOT {inside} RETURNING thumbnail_path");
    let mut statement = connection.prepare(&sql)?;
    let thumbnails = statement
        .query_map(params_from_iter(values), |row| row.get::<_, Option<String>>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(thumbnails.into_iter().flatten().collect())
}

pub struct LibraryTotals {
    pub total_videos: i64,
    pub watched_videos: i64,
    pub total_duration_seconds: f64,
    pub orphaned_videos: i64,
}

/// Totals over the videos inside the library folders, plus how many videos are orphaned.
pub fn library_totals(connection: &Connection, library_folders: &[String]) -> AppResult<LibraryTotals> {
    let (inside, values) = inside_any(library_folders);
    let sql = format!(
        "SELECT COALESCE(SUM({inside}), 0),
                COALESCE(SUM({inside} AND v.is_watched = 1), 0),
                COALESCE(SUM(CASE WHEN {inside} THEN v.duration_seconds ELSE 0 END), 0),
                COALESCE(SUM(NOT {inside}), 0)
         FROM videos v"
    );
    Ok(connection.query_row(&sql, params_from_iter(values), |row| {
        Ok(LibraryTotals {
            total_videos: row.get(0)?,
            watched_videos: row.get(1)?,
            total_duration_seconds: row.get(2)?,
            orphaned_videos: row.get(3)?,
        })
    })?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support;
    use crate::db::videos::tests::{add_video, path};

    fn paths(videos: &[Video]) -> Vec<String> {
        videos.iter().map(|video| video.file_path.clone()).collect()
    }

    #[test]
    fn orphans_are_videos_outside_every_library_folder() {
        // Regression (B4): orphan cleanup referenced a table and a column that do not exist.
        let connection = test_support::connection();
        add_video(&connection, &path(&["Lib", "a.mkv"]), 60.0);
        add_video(&connection, &path(&["Removed", "b.mkv"]), 30.0);
        let folders = vec!["Lib".to_owned()];

        assert_eq!(
            paths(&orphans(&connection, &folders).unwrap()),
            vec![path(&["Removed", "b.mkv"])]
        );
        let totals = library_totals(&connection, &folders).unwrap();
        assert_eq!(
            (
                totals.total_videos,
                totals.total_duration_seconds,
                totals.orphaned_videos
            ),
            (1, 60.0, 1)
        );

        assert_eq!(
            delete_orphans(&connection, &folders).unwrap(),
            vec!["thumb.jpg".to_owned()]
        );
        assert!(orphans(&connection, &folders).unwrap().is_empty());
    }

    #[test]
    fn without_library_folders_every_video_is_orphaned() {
        let connection = test_support::connection();
        add_video(&connection, "a.mkv", 1.0);
        assert_eq!(orphans(&connection, &[]).unwrap().len(), 1);
        assert_eq!(library_totals(&connection, &[]).unwrap().total_videos, 0);
    }
}
