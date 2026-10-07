use std::path::Path;

use rusqlite::{Connection, OptionalExtension, Row, params};

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
        created_at: row.get(3)?,
    })
}

pub fn list(connection: &Connection) -> AppResult<Vec<LibraryFolder>> {
    let mut statement = connection
        .prepare_cached("SELECT id, path, custom_icon, created_at FROM library_folders ORDER BY created_at, id")?;
    let folders = statement.query_map([], map_folder)?.collect::<Result<_, _>>()?;
    Ok(folders)
}

pub fn paths(connection: &Connection) -> AppResult<Vec<String>> {
    Ok(list(connection)?.into_iter().map(|folder| folder.path).collect())
}

pub fn find(connection: &Connection, path: &str) -> AppResult<Option<LibraryFolder>> {
    Ok(connection
        .query_row(
            "SELECT id, path, custom_icon, created_at FROM library_folders WHERE path = ?1",
            [path],
            map_folder,
        )
        .optional()?)
}

/// Adds a library folder; adding an existing one returns it unchanged.
pub fn add(connection: &Connection, path: &str) -> AppResult<LibraryFolder> {
    connection.execute(
        "INSERT INTO library_folders (path) VALUES (?1) ON CONFLICT (path) DO NOTHING",
        [path],
    )?;
    find(connection, path)?.ok_or_else(|| AppError::NotFound(format!("library folder {path}")))
}

pub fn remove(connection: &Connection, path: &str) -> AppResult<()> {
    if connection.execute("DELETE FROM library_folders WHERE path = ?1", [path])? == 0 {
        return Err(AppError::NotFound(format!("library folder {path}")));
    }
    Ok(())
}

pub fn set_icon(connection: &Connection, path: &str, icon: Option<&str>) -> AppResult<()> {
    let changed = connection.execute(
        "UPDATE library_folders SET custom_icon = ?2 WHERE path = ?1",
        params![path, icon],
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support;
    use crate::db::videos::tests::path;

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

    #[test]
    fn icon_can_be_set_and_cleared() {
        let connection = test_support::connection();
        let folder = add(&connection, "Videos").unwrap();
        set_icon(&connection, &folder.path, Some("🎬")).unwrap();
        assert_eq!(
            find(&connection, "Videos").unwrap().unwrap().custom_icon.as_deref(),
            Some("🎬")
        );
        set_icon(&connection, &folder.path, None).unwrap();
        assert_eq!(find(&connection, "Videos").unwrap().unwrap().custom_icon, None);
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
