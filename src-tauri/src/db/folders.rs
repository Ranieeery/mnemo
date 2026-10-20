use std::collections::HashMap;
use std::path::Path;

use rusqlite::{Connection, OptionalExtension, Row, params};

use crate::domain::folder_color::FolderColor;
use crate::domain::folder_order::reordered;
use crate::domain::folder_view::FolderViewMode;
use crate::domain::media::display_name;
use crate::domain::models::LibraryFolder;
use crate::domain::paths::FolderBounds;
use crate::error::{AppError, AppResult};

fn map_folder(row: &Row) -> rusqlite::Result<LibraryFolder> {
    let path: String = row.get(1)?;
    Ok(LibraryFolder {
        id: row.get(0)?,
        name: display_name(Path::new(&path)),
        path,
        custom_icon: row.get::<_, Option<String>>(2)?.filter(|icon| !icon.is_empty()),
        // A name this version does not know (written by a newer one, or by hand) shows the default color.
        icon_color: row.get::<_, Option<String>>(4)?.as_deref().and_then(FolderColor::parse),
        created_at: row.get(3)?,
    })
}

/// The library folders in their custom order.
pub fn list(connection: &Connection) -> AppResult<Vec<LibraryFolder>> {
    let mut statement = connection.prepare_cached(
        "SELECT id, path, custom_icon, created_at, icon_color FROM library_folders ORDER BY sort_order, created_at, id",
    )?;
    let folders = statement.query_map([], map_folder)?.collect::<Result<_, _>>()?;
    Ok(folders)
}

pub fn paths(connection: &Connection) -> AppResult<Vec<String>> {
    Ok(list(connection)?.into_iter().map(|folder| folder.path).collect())
}

pub fn find(connection: &Connection, path: &str) -> AppResult<Option<LibraryFolder>> {
    Ok(connection
        .query_row(
            "SELECT id, path, custom_icon, created_at, icon_color FROM library_folders WHERE path = ?1",
            [path],
            map_folder,
        )
        .optional()?)
}

/// Adds a library folder at the end of the custom order; adding an existing one returns it unchanged.
pub fn add(connection: &Connection, path: &str) -> AppResult<LibraryFolder> {
    connection.execute(
        "INSERT INTO library_folders (path, sort_order)
         VALUES (?1, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM library_folders))
         ON CONFLICT (path) DO NOTHING",
        [path],
    )?;
    find(connection, path)?.ok_or_else(|| AppError::NotFound(format!("library folder {path}")))
}

/// Removes a library folder and closes the gap it leaves in the custom order.
pub fn remove(connection: &Connection, path: &str) -> AppResult<()> {
    if connection.execute("DELETE FROM library_folders WHERE path = ?1", [path])? == 0 {
        return Err(AppError::NotFound(format!("library folder {path}")));
    }
    compact_order(connection)
}

/// Numbers the custom order 0, 1, 2… keeping it. Positions shared after an import fall back to the date added.
pub fn compact_order(connection: &Connection) -> AppResult<()> {
    connection.execute(
        "UPDATE library_folders SET sort_order = ranked.position
         FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, created_at, id) - 1 AS position
               FROM library_folders) AS ranked
         WHERE ranked.id = library_folders.id AND library_folders.sort_order <> ranked.position",
        [],
    )?;
    Ok(())
}

/// Stores a new custom order, given as folder ids (see `folder_order::reordered`). Call it inside a transaction.
pub fn reorder(connection: &Connection, ids: &[i64]) -> AppResult<()> {
    let current: Vec<i64> = list(connection)?.iter().map(|folder| folder.id).collect();
    let mut statement = connection.prepare_cached("UPDATE library_folders SET sort_order = ?2 WHERE id = ?1")?;
    for (position, id) in reordered(&current, ids).into_iter().enumerate() {
        statement.execute(params![id, position as i64])?;
    }
    Ok(())
}

/// When a video inside each library folder was last watched (`last_watched_at`), for the folders with any. Each
/// folder is a range over the `file_path` index.
pub fn last_watched(connection: &Connection, folders: &[LibraryFolder]) -> AppResult<HashMap<i64, String>> {
    let mut statement = connection
        .prepare_cached("SELECT MAX(last_watched_at) FROM videos WHERE file_path >= ?1 AND file_path < ?2")?;
    let mut latest = HashMap::new();
    for folder in folders {
        let bounds = FolderBounds::new(&folder.path);
        let watched_at: Option<String> = statement.query_row(params![bounds.lower, bounds.upper], |row| row.get(0))?;
        if let Some(watched_at) = watched_at {
            latest.insert(folder.id, watched_at);
        }
    }
    Ok(latest)
}

/// Sets the icon and its color (`None` restores each default).
pub fn set_appearance(
    connection: &Connection,
    path: &str,
    icon: Option<&str>,
    color: Option<FolderColor>,
) -> AppResult<()> {
    let changed = connection.execute(
        "UPDATE library_folders SET custom_icon = ?2, icon_color = ?3 WHERE path = ?1",
        params![path, icon, color.map(FolderColor::as_str)],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("library folder {path}")));
    }
    Ok(())
}

/// Every explicit per-folder view mode. The list is small, so inheritance is resolved in memory.
pub fn view_modes(connection: &Connection) -> AppResult<Vec<(String, FolderViewMode)>> {
    let mut statement = connection.prepare_cached("SELECT path, view_mode FROM folder_settings")?;
    let rows = statement
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows
        .into_iter()
        .filter_map(|(path, mode)| FolderViewMode::parse(&mode).map(|mode| (path, mode)))
        .collect())
}

/// Sets the view mode of a folder, or clears it (`None`) so the folder inherits again.
pub fn set_view_mode(connection: &Connection, path: &str, mode: Option<FolderViewMode>) -> AppResult<()> {
    match mode {
        Some(mode) => connection.execute(
            "INSERT INTO folder_settings (path, view_mode) VALUES (?1, ?2)
             ON CONFLICT (path) DO UPDATE SET view_mode = excluded.view_mode",
            params![path, mode.as_str()],
        )?,
        None => connection.execute("DELETE FROM folder_settings WHERE path = ?1", [path])?,
    };
    Ok(())
}

/// Removes the view mode settings of a folder and of everything inside it.
pub fn clear_view_modes_within(connection: &Connection, path: &str) -> AppResult<()> {
    let bounds = FolderBounds::new(path);
    connection.execute(
        "DELETE FROM folder_settings WHERE path = ?1 OR (path >= ?2 AND path < ?3)",
        params![path, bounds.lower, bounds.upper],
    )?;
    Ok(())
}

/// Keeps the view mode settings of a folder and of everything inside it when the folder is renamed or moved.
pub fn move_view_modes(connection: &Connection, from: &str, to: &str) -> AppResult<()> {
    let source = FolderBounds::new(from);
    let target = FolderBounds::new(to);
    connection.execute(
        "UPDATE OR IGNORE folder_settings
         SET path = CASE WHEN path = ?1 THEN ?4 ELSE ?5 || substr(path, ?6) END
         WHERE path = ?1 OR (path >= ?2 AND path < ?3)",
        params![
            from,
            source.lower,
            source.upper,
            to,
            target.lower,
            source.prefix_chars() as i64 + 1
        ],
    )?;
    Ok(())
}

/// Points a library folder, and any library folder inside it, at a new location, keeping their ids and icons.
pub fn relocate(connection: &Connection, from: &str, to: &str) -> AppResult<()> {
    let source = FolderBounds::new(from);
    let target = FolderBounds::new(to);
    let changed = connection.execute(
        "UPDATE library_folders
         SET path = CASE WHEN path = ?1 THEN ?4 ELSE ?5 || substr(path, ?6) END
         WHERE path = ?1 OR (path >= ?2 AND path < ?3)",
        params![
            from,
            source.lower,
            source.upper,
            to,
            target.lower,
            source.prefix_chars() as i64 + 1
        ],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("library folder {from}")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support;
    use crate::db::videos::tests::path;
    use crate::domain::folder_color::FolderColor;

    #[test]
    fn relocates_a_folder_with_the_library_folders_inside_it() {
        let connection = test_support::connection();
        let videos = add(&connection, &path(&["D:", "Videos"])).unwrap();
        let anime = add(&connection, &path(&["D:", "Videos", "Anime"])).unwrap();
        let sibling = add(&connection, &path(&["D:", "Videos 2"])).unwrap();
        set_appearance(&connection, &videos.path, Some("film"), Some(FolderColor::Teal)).unwrap();

        relocate(&connection, &videos.path, &path(&["E:", "Videos"])).unwrap();
        let folders = list(&connection).unwrap();
        let moved = folders.iter().find(|folder| folder.id == videos.id).unwrap();
        assert_eq!(moved.path, path(&["E:", "Videos"]));
        assert_eq!(moved.custom_icon.as_deref(), Some("film"));
        assert_eq!(moved.icon_color, Some(FolderColor::Teal));
        assert_eq!(moved.created_at, videos.created_at);
        let nested = folders.iter().find(|folder| folder.id == anime.id).unwrap();
        assert_eq!(nested.path, path(&["E:", "Videos", "Anime"]));
        assert!(folders.contains(&sibling));

        assert!(matches!(
            relocate(&connection, &path(&["D:", "Gone"]), "E:"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn adds_lists_and_removes_folders() {
        let connection = test_support::connection();
        let added = add(&connection, &path(&["D:", "Videos"])).unwrap();
        assert_eq!(added.name, "Videos");
        assert_eq!(add(&connection, &added.path).unwrap(), added);
        assert_eq!(list(&connection).unwrap(), vec![added.clone()]);

        remove(&connection, &added.path).unwrap();
        assert!(list(&connection).unwrap().is_empty());
        assert!(matches!(remove(&connection, &added.path), Err(AppError::NotFound(_))));
    }

    fn ids(connection: &Connection) -> Vec<i64> {
        list(connection).unwrap().iter().map(|folder| folder.id).collect()
    }

    #[test]
    fn new_folders_go_last_and_removing_one_leaves_no_gap() {
        let connection = test_support::connection();
        let a = add(&connection, "A").unwrap().id;
        let b = add(&connection, "B").unwrap().id;
        let c = add(&connection, "C").unwrap().id;
        reorder(&connection, &[c, a, b]).unwrap();
        let d = add(&connection, "D").unwrap().id;
        assert_eq!(ids(&connection), [c, a, b, d]);

        remove(&connection, "A").unwrap();
        let positions: Vec<i64> = connection
            .prepare("SELECT sort_order FROM library_folders ORDER BY sort_order")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(positions, [0, 1, 2]);
        assert_eq!(ids(&connection), [c, b, d]);
        assert_eq!(add(&connection, "E").unwrap().id, *ids(&connection).last().unwrap());
    }

    #[test]
    fn reordering_keeps_left_out_folders_after_the_requested_ones() {
        let connection = test_support::connection();
        let a = add(&connection, "A").unwrap().id;
        let b = add(&connection, "B").unwrap().id;
        let c = add(&connection, "C").unwrap().id;
        reorder(&connection, &[c, 999, c]).unwrap();
        assert_eq!(ids(&connection), [c, a, b]);
    }

    #[test]
    fn relocating_keeps_the_custom_order() {
        let connection = test_support::connection();
        let videos = add(&connection, &path(&["D:", "Videos"])).unwrap().id;
        let anime = add(&connection, &path(&["D:", "Videos", "Anime"])).unwrap().id;
        let other = add(&connection, &path(&["F:", "Other"])).unwrap().id;
        reorder(&connection, &[anime, other, videos]).unwrap();
        relocate(&connection, &path(&["D:", "Videos"]), &path(&["E:", "Videos"])).unwrap();
        assert_eq!(ids(&connection), [anime, other, videos]);
    }

    #[test]
    fn last_watched_covers_every_video_inside_each_folder() {
        let connection = test_support::connection();
        let show = add(&connection, &path(&["Lib", "Show"])).unwrap();
        let season = add(&connection, &path(&["Lib", "Show", "Season 1"])).unwrap();
        let unwatched = add(&connection, &path(&["Lib", "Show 2"])).unwrap();
        connection
            .execute(
                "INSERT INTO videos (file_path, title, last_watched_at) VALUES
                 (?1, 'a', '2025-02-01 10:00:00'), (?2, 'b', '2025-03-01 10:00:00'), (?3, 'c', NULL)",
                params![
                    path(&["Lib", "Show", "a.mkv"]),
                    path(&["Lib", "Show", "Season 1", "b.mkv"]),
                    path(&["Lib", "Show 2", "c.mkv"])
                ],
            )
            .unwrap();
        let latest = last_watched(&connection, &[show.clone(), season.clone(), unwatched.clone()]).unwrap();
        assert_eq!(latest.get(&show.id).map(String::as_str), Some("2025-03-01 10:00:00"));
        assert_eq!(latest.get(&season.id).map(String::as_str), Some("2025-03-01 10:00:00"));
        assert!(!latest.contains_key(&unwatched.id));
    }

    #[test]
    fn icon_and_color_can_be_set_and_cleared() {
        let connection = test_support::connection();
        let folder = add(&connection, "Videos").unwrap();
        assert_eq!(folder.icon_color, None);
        set_appearance(&connection, &folder.path, Some("🎬"), Some(FolderColor::Amber)).unwrap();
        let styled = find(&connection, "Videos").unwrap().unwrap();
        assert_eq!(styled.custom_icon.as_deref(), Some("🎬"));
        assert_eq!(styled.icon_color, Some(FolderColor::Amber));

        set_appearance(&connection, &folder.path, None, None).unwrap();
        let plain = find(&connection, "Videos").unwrap().unwrap();
        assert_eq!((plain.custom_icon, plain.icon_color), (None, None));
        assert!(matches!(
            set_appearance(&connection, "Missing", None, None),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn an_unknown_stored_color_shows_the_default() {
        let connection = test_support::connection();
        add(&connection, "Videos").unwrap();
        connection
            .execute("UPDATE library_folders SET icon_color = 'chartreuse'", [])
            .unwrap();
        assert_eq!(find(&connection, "Videos").unwrap().unwrap().icon_color, None);
    }

    #[test]
    fn view_modes_are_upserted_cleared_and_removed_with_the_tree() {
        let connection = test_support::connection();
        let courses = path(&["Lib", "Courses"]);
        let module = path(&["Lib", "Courses", "Module 1"]);
        let sibling = path(&["Lib", "Courses 2"]);
        set_view_mode(&connection, &courses, Some(FolderViewMode::Folders)).unwrap();
        set_view_mode(&connection, &courses, Some(FolderViewMode::Continuous)).unwrap();
        set_view_mode(&connection, &module, Some(FolderViewMode::Folders)).unwrap();
        set_view_mode(&connection, &sibling, Some(FolderViewMode::Continuous)).unwrap();
        assert_eq!(view_modes(&connection).unwrap().len(), 3);

        move_view_modes(&connection, &courses, &path(&["Lib", "Old courses"])).unwrap();
        let moved: Vec<String> = view_modes(&connection)
            .unwrap()
            .into_iter()
            .map(|(path, _)| path)
            .collect();
        assert!(moved.contains(&path(&["Lib", "Old courses"])));
        assert!(moved.contains(&path(&["Lib", "Old courses", "Module 1"])));
        assert!(moved.contains(&sibling));
        move_view_modes(&connection, &path(&["Lib", "Old courses"]), &courses).unwrap();

        set_view_mode(&connection, &sibling, None).unwrap();
        clear_view_modes_within(&connection, &courses).unwrap();
        assert!(view_modes(&connection).unwrap().is_empty());
    }
}
