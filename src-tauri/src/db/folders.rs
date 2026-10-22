use std::collections::HashMap;
use std::path::Path;

use rusqlite::{Connection, OptionalExtension, Row, params, params_from_iter};

use super::hidden::VISIBLE;
use super::layout::{self, NEXT_PINNED_TOP_LEVEL, NEXT_TOP_LEVEL};
use super::videos::within_except;
use crate::domain::folder_color::FolderColor;
use crate::domain::folder_view::FolderViewMode;
use crate::domain::media::display_name;
use crate::domain::models::LibraryFolder;
use crate::domain::paths::FolderBounds;
use crate::error::{AppError, AppResult};

/// The columns [`map_folder`] reads, in its order.
const COLUMNS: &str = "id, path, custom_icon, created_at, icon_color, custom_name, group_id, pin_order IS NOT NULL";

fn map_folder(row: &Row) -> rusqlite::Result<LibraryFolder> {
    let path: String = row.get(1)?;
    let folder_name = display_name(Path::new(&path));
    // A blank name (written by hand) shows the folder's own name.
    let custom_name = row.get::<_, Option<String>>(5)?.filter(|name| !name.trim().is_empty());
    Ok(LibraryFolder {
        id: row.get(0)?,
        name: custom_name.clone().unwrap_or_else(|| folder_name.clone()),
        folder_name,
        custom_name,
        group_id: row.get(6)?,
        pinned: row.get(7)?,
        path,
        custom_icon: row.get::<_, Option<String>>(2)?.filter(|icon| !icon.is_empty()),
        // A name this version does not know (written by a newer one, or by hand) shows the default color.
        icon_color: row.get::<_, Option<String>>(4)?.as_deref().and_then(FolderColor::parse),
        created_at: row.get(3)?,
    })
}

/// The library folders, in the order they were added (see `layout` for the custom order).
pub fn list(connection: &Connection) -> AppResult<Vec<LibraryFolder>> {
    let mut statement = connection.prepare_cached(&format!(
        "SELECT {COLUMNS} FROM library_folders ORDER BY created_at, id"
    ))?;
    let folders = statement.query_map([], map_folder)?.collect::<Result<_, _>>()?;
    Ok(folders)
}

pub fn paths(connection: &Connection) -> AppResult<Vec<String>> {
    Ok(list(connection)?.into_iter().map(|folder| folder.path).collect())
}

pub fn find(connection: &Connection, path: &str) -> AppResult<Option<LibraryFolder>> {
    Ok(connection
        .query_row(
            &format!("SELECT {COLUMNS} FROM library_folders WHERE path = ?1"),
            [path],
            map_folder,
        )
        .optional()?)
}

/// Like [`find`], but a missing folder is an error.
pub fn get(connection: &Connection, path: &str) -> AppResult<LibraryFolder> {
    find(connection, path)?.ok_or_else(|| AppError::NotFound(format!("library folder {path}")))
}

/// Adds a library folder at the end of the list, without a group; adding an existing one returns it unchanged.
pub fn add(connection: &Connection, path: &str) -> AppResult<LibraryFolder> {
    connection.execute(
        &format!(
            "INSERT INTO library_folders (path, sort_order) VALUES (?1, {NEXT_TOP_LEVEL}) ON CONFLICT (path) DO NOTHING"
        ),
        [path],
    )?;
    get(connection, path)
}

/// Removes a library folder and closes the gap it leaves in the custom order.
pub fn remove(connection: &Connection, path: &str) -> AppResult<()> {
    if connection.execute("DELETE FROM library_folders WHERE path = ?1", [path])? == 0 {
        return Err(AppError::NotFound(format!("library folder {path}")));
    }
    layout::compact(connection)
}

/// Puts a folder at the end of a group, or with `None` at the end of the list, closing the gap it leaves. A pinned
/// folder stays pinned, at the end of the pinned folders there. Call it inside a transaction.
pub fn move_to_group(connection: &Connection, id: i64, group_id: Option<i64>) -> AppResult<()> {
    let changed = connection.execute(
        &format!(
            "UPDATE library_folders
             SET sort_order = CASE WHEN ?2 IS NULL THEN {NEXT_TOP_LEVEL}
                 ELSE (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM library_folders WHERE group_id = ?2 AND id <> ?1)
                 END,
                 pin_order = CASE WHEN pin_order IS NULL THEN NULL
                 WHEN ?2 IS NULL THEN {NEXT_PINNED_TOP_LEVEL}
                 ELSE (SELECT COALESCE(MAX(pin_order) + 1, 0) FROM library_folders WHERE group_id = ?2 AND id <> ?1)
                 END,
                 group_id = ?2
             WHERE id = ?1"
        ),
        params![id, group_id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("library folder {id}")));
    }
    layout::compact(connection)
}

/// Pins a folder at the end of the pinned folders of its list (its group's, or the library's), or unpins it. Its
/// place in the custom order is kept, so unpinned it goes back there. Pinning a pinned folder changes nothing. Call
/// it inside a transaction.
pub fn set_pinned(connection: &Connection, id: i64, pinned: bool) -> AppResult<()> {
    let changed = connection.execute(
        &format!(
            "UPDATE library_folders
             SET pin_order = CASE WHEN NOT ?2 THEN NULL
                 WHEN pin_order IS NOT NULL THEN pin_order
                 WHEN group_id IS NULL THEN {NEXT_PINNED_TOP_LEVEL}
                 ELSE (SELECT COALESCE(MAX(pin_order) + 1, 0) FROM library_folders AS other
                       WHERE other.group_id = library_folders.group_id)
                 END
             WHERE id = ?1"
        ),
        params![id, pinned],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("library folder {id}")));
    }
    layout::compact(connection)
}

/// When a video inside each library folder was last watched (`last_watched_at`), for the folders with any. Each
/// folder is a range over the `file_path` index. Videos in hidden folders do not count.
pub fn last_watched(connection: &Connection, folders: &[LibraryFolder]) -> AppResult<HashMap<i64, String>> {
    let mut statement = connection.prepare_cached(&format!(
        "SELECT MAX(v.last_watched_at) FROM videos v WHERE v.file_path >= ?1 AND v.file_path < ?2 AND {VISIBLE}"
    ))?;
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

/// Sets the name shown in the app (`None` shows the folder's own name). See `folder_name::normalize_custom_name`.
pub fn set_custom_name(connection: &Connection, path: &str, name: Option<&str>) -> AppResult<()> {
    if connection.execute(
        "UPDATE library_folders SET custom_name = ?2 WHERE path = ?1",
        params![path, name],
    )? == 0
    {
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

/// Removes the view mode settings of a folder and of everything inside it, except those at or inside the `kept`
/// folders.
pub fn clear_view_modes_within(connection: &Connection, path: &str, kept: &[String]) -> AppResult<()> {
    let (condition, values) = within_except("path", path, kept);
    connection.execute(
        &format!("DELETE FROM folder_settings WHERE {condition}"),
        params_from_iter(values),
    )?;
    Ok(())
}

/// Keeps the view mode settings of a folder and of everything inside it when the folder is renamed or moved. Settings
/// left at `to` (a folder that no longer existed) are replaced.
pub fn move_view_modes(connection: &Connection, from: &str, to: &str) -> AppResult<()> {
    let source = FolderBounds::new(from);
    let target = FolderBounds::new(to);
    clear_view_modes_within(connection, to, &[])?;
    connection.execute(
        "UPDATE folder_settings
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
    if move_within(connection, from, to)? == 0 {
        return Err(AppError::NotFound(format!("library folder {from}")));
    }
    Ok(())
}

/// Follows the library folders at or inside `from` to `to` (a folder renamed on disk), keeping their ids and icons.
/// Returns how many moved.
pub fn move_within(connection: &Connection, from: &str, to: &str) -> AppResult<usize> {
    let source = FolderBounds::new(from);
    let target = FolderBounds::new(to);
    Ok(connection.execute(
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
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support;
    use crate::db::videos::tests::path;
    use crate::domain::folder_color::FolderColor;
    use crate::domain::models::LayoutEntry;

    #[test]
    fn relocates_a_folder_with_the_library_folders_inside_it() {
        let connection = test_support::connection();
        let videos = add(&connection, &path(&["D:", "Videos"])).unwrap();
        let anime = add(&connection, &path(&["D:", "Videos", "Anime"])).unwrap();
        let sibling = add(&connection, &path(&["D:", "Videos 2"])).unwrap();
        set_appearance(&connection, &videos.path, Some("film"), Some(FolderColor::Teal)).unwrap();
        set_custom_name(&connection, &videos.path, Some("Movies")).unwrap();
        set_custom_name(&connection, &anime.path, Some("Shows")).unwrap();
        let group = crate::db::groups::create(&connection, "Series").unwrap();
        move_to_group(&connection, videos.id, Some(group.id)).unwrap();

        relocate(&connection, &videos.path, &path(&["E:", "Films"])).unwrap();
        let folders = list(&connection).unwrap();
        let moved = folders.iter().find(|folder| folder.id == videos.id).unwrap();
        assert_eq!(moved.path, path(&["E:", "Films"]));
        assert_eq!(moved.custom_icon.as_deref(), Some("film"));
        assert_eq!(moved.icon_color, Some(FolderColor::Teal));
        assert_eq!(moved.created_at, videos.created_at);
        assert_eq!(
            (
                moved.name.as_str(),
                moved.folder_name.as_str(),
                moved.custom_name.as_deref()
            ),
            ("Movies", "Films", Some("Movies"))
        );
        let nested = folders.iter().find(|folder| folder.id == anime.id).unwrap();
        assert_eq!(nested.path, path(&["E:", "Films", "Anime"]));
        assert_eq!(nested.name, "Shows");
        assert_eq!((moved.group_id, nested.group_id), (Some(group.id), None));
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

    /// The folders of the list, in the custom order (no groups in these tests).
    fn ids(connection: &Connection) -> Vec<i64> {
        layout::read(connection)
            .unwrap()
            .into_iter()
            .filter_map(|entry| match entry {
                LayoutEntry::Folder { id } => Some(id),
                LayoutEntry::Group { .. } => None,
            })
            .collect()
    }

    fn arrange(connection: &Connection, ids: &[i64]) {
        let order: Vec<LayoutEntry> = ids.iter().map(|id| LayoutEntry::Folder { id: *id }).collect();
        layout::write(connection, &order).unwrap();
    }

    #[test]
    fn new_folders_go_last_and_removing_one_leaves_no_gap() {
        let connection = test_support::connection();
        let a = add(&connection, "A").unwrap().id;
        let b = add(&connection, "B").unwrap().id;
        let c = add(&connection, "C").unwrap().id;
        arrange(&connection, &[c, a, b]);
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
    fn moving_to_a_group_goes_to_its_end_and_out_of_it_to_the_end_of_the_list() {
        let connection = test_support::connection();
        let a = add(&connection, "A").unwrap().id;
        let series = crate::db::groups::create(&connection, "Series").unwrap().id;
        let b = add(&connection, "B").unwrap().id;
        let c = add(&connection, "C").unwrap().id;
        move_to_group(&connection, c, Some(series)).unwrap();
        move_to_group(&connection, a, Some(series)).unwrap();
        assert_eq!(
            layout::read(&connection).unwrap(),
            [
                LayoutEntry::Group {
                    id: series,
                    folders: vec![c, a]
                },
                LayoutEntry::Folder { id: b },
            ]
        );

        move_to_group(&connection, c, None).unwrap();
        assert_eq!(ids(&connection), [b, c]);
        assert!(matches!(
            move_to_group(&connection, 99, None),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn relocating_keeps_the_custom_order() {
        let connection = test_support::connection();
        let videos = add(&connection, &path(&["D:", "Videos"])).unwrap().id;
        let anime = add(&connection, &path(&["D:", "Videos", "Anime"])).unwrap().id;
        let other = add(&connection, &path(&["F:", "Other"])).unwrap().id;
        arrange(&connection, &[anime, other, videos]);
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
    fn a_custom_name_replaces_the_folder_name_until_it_is_cleared() {
        let connection = test_support::connection();
        let folder = add(&connection, &path(&["D:", "Anime 2019"])).unwrap();
        assert_eq!(
            (
                folder.name.as_str(),
                folder.folder_name.as_str(),
                folder.custom_name.as_deref()
            ),
            ("Anime 2019", "Anime 2019", None)
        );
        let other = add(&connection, &path(&["D:", "Other"])).unwrap();

        set_custom_name(&connection, &folder.path, Some("Anime")).unwrap();
        // Two folders may share a name.
        set_custom_name(&connection, &other.path, Some("Anime")).unwrap();
        let renamed = find(&connection, &folder.path).unwrap().unwrap();
        assert_eq!(
            (
                renamed.name.as_str(),
                renamed.folder_name.as_str(),
                renamed.custom_name.as_deref()
            ),
            ("Anime", "Anime 2019", Some("Anime"))
        );
        assert_eq!(find(&connection, &other.path).unwrap().unwrap().name, "Anime");

        set_custom_name(&connection, &folder.path, None).unwrap();
        let reset = find(&connection, &folder.path).unwrap().unwrap();
        assert_eq!((reset.name.as_str(), reset.custom_name), ("Anime 2019", None));
        assert!(matches!(
            set_custom_name(&connection, "Missing", Some("Name")),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn a_blank_stored_name_shows_the_folder_name() {
        let connection = test_support::connection();
        add(&connection, "Videos").unwrap();
        connection
            .execute("UPDATE library_folders SET custom_name = '   '", [])
            .unwrap();
        let folder = find(&connection, "Videos").unwrap().unwrap();
        assert_eq!((folder.name.as_str(), folder.custom_name), ("Videos", None));
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
        clear_view_modes_within(&connection, &courses, &[]).unwrap();
        assert!(view_modes(&connection).unwrap().is_empty());
    }

    #[test]
    fn moving_view_modes_over_stale_ones_replaces_them() {
        // Regression: `UPDATE OR IGNORE` left the moved folder's setting behind when the target had one.
        let connection = test_support::connection();
        let (from, to) = (path(&["Lib", "Show"]), path(&["Lib", "Series"]));
        set_view_mode(&connection, &from, Some(FolderViewMode::Continuous)).unwrap();
        set_view_mode(&connection, &to, Some(FolderViewMode::Folders)).unwrap();
        set_view_mode(
            &connection,
            &path(&["Lib", "Series", "Old"]),
            Some(FolderViewMode::Continuous),
        )
        .unwrap();

        move_view_modes(&connection, &from, &to).unwrap();

        assert_eq!(view_modes(&connection).unwrap(), [(to, FolderViewMode::Continuous)]);
    }

    #[test]
    fn library_folders_inside_a_renamed_folder_follow_it() {
        let connection = test_support::connection();
        let outer = add(&connection, &path(&["D:", "Videos"])).unwrap();
        let nested = add(&connection, &path(&["D:", "Videos", "Anime"])).unwrap();

        let moved = move_within(
            &connection,
            &path(&["D:", "Videos", "Anime"]),
            &path(&["D:", "Videos", "Shows"]),
        );

        assert_eq!(moved.unwrap(), 1);
        let folders = list(&connection).unwrap();
        let path_of = |id: i64| {
            folders
                .iter()
                .find(|folder| folder.id == id)
                .map(|folder| folder.path.clone())
        };
        assert_eq!(path_of(nested.id), Some(path(&["D:", "Videos", "Shows"])));
        assert_eq!(path_of(outer.id), Some(outer.path));
        assert_eq!(
            move_within(&connection, &path(&["D:", "Elsewhere"]), &path(&["D:", "Other"])).unwrap(),
            0
        );
    }
}
