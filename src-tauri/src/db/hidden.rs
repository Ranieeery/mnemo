//! Folders hidden from the home page and the history. Their videos stay in the library (progress and history are
//! still recorded) and are shown normally when browsing the folder.

use rusqlite::{Connection, params};

use crate::domain::paths::FolderBounds;
use crate::error::AppResult;

/// Condition on a video aliased `v` that holds when it lies in no hidden folder. Each hidden folder is a range over
/// `file_path`, so the match is by whole path components and the table, small in practice, is read by its index.
pub(super) const VISIBLE: &str = "NOT EXISTS (SELECT 1 FROM hidden_folders h
                                              WHERE v.file_path >= h.lower_bound AND v.file_path < h.upper_bound)";

/// The hidden folders, in path order.
pub fn list(connection: &Connection) -> AppResult<Vec<String>> {
    let mut statement = connection.prepare_cached("SELECT path FROM hidden_folders ORDER BY path")?;
    let paths = statement.query_map([], |row| row.get(0))?.collect::<Result<_, _>>()?;
    Ok(paths)
}

/// Hides a folder; hiding it again changes nothing.
pub fn hide(connection: &Connection, path: &str) -> AppResult<()> {
    let bounds = FolderBounds::new(path);
    connection.execute(
        "INSERT INTO hidden_folders (path, lower_bound, upper_bound) VALUES (?1, ?2, ?3)
         ON CONFLICT (path) DO NOTHING",
        params![path, bounds.lower, bounds.upper],
    )?;
    Ok(())
}

/// Shows a folder again. Hidden folders inside it stay hidden.
pub fn show(connection: &Connection, path: &str) -> AppResult<()> {
    connection.execute("DELETE FROM hidden_folders WHERE path = ?1", [path])?;
    Ok(())
}

/// Hidden folders that are `path` itself or lie inside it.
fn within(connection: &Connection, path: &str) -> AppResult<Vec<String>> {
    let bounds = FolderBounds::new(path);
    let mut statement = connection.prepare_cached(
        "SELECT path FROM hidden_folders WHERE path = ?1 OR (path >= ?2 AND path < ?3) ORDER BY path",
    )?;
    let paths = statement
        .query_map(params![path, bounds.lower, bounds.upper], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(paths)
}

/// Forgets the hidden folders at or inside `path` (a library folder being removed).
pub fn delete_within(connection: &Connection, path: &str) -> AppResult<()> {
    let bounds = FolderBounds::new(path);
    connection.execute(
        "DELETE FROM hidden_folders WHERE path = ?1 OR (path >= ?2 AND path < ?3)",
        params![path, bounds.lower, bounds.upper],
    )?;
    Ok(())
}

/// Keeps the hidden folders at or inside `from` hidden when it is renamed, moved or located elsewhere. Their ranges
/// are computed again, so they always come from [`FolderBounds`].
pub fn move_within(connection: &Connection, from: &str, to: &str) -> AppResult<()> {
    let source = FolderBounds::new(from);
    let target = FolderBounds::new(to);
    for path in within(connection, from)? {
        let moved = match path.strip_prefix(source.lower.as_str()) {
            Some(relative) => format!("{}{relative}", target.lower),
            None => to.to_owned(),
        };
        show(connection, &path)?;
        hide(connection, &moved)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support;
    use crate::db::videos::tests::path;

    #[test]
    fn hiding_and_showing_are_idempotent() {
        let connection = test_support::connection();
        let folder = path(&["D:", "Private"]);
        hide(&connection, &folder).unwrap();
        hide(&connection, &folder).unwrap();
        assert_eq!(list(&connection).unwrap(), std::slice::from_ref(&folder));
        show(&connection, &folder).unwrap();
        show(&connection, &folder).unwrap();
        assert!(list(&connection).unwrap().is_empty());
    }

    #[test]
    fn moves_the_folder_and_the_hidden_folders_inside_it_but_not_siblings() {
        let connection = test_support::connection();
        let (old, new) = (path(&["D:", "Show"]), path(&["E:", "Series", "Show"]));
        let nested = path(&["D:", "Show", "Extras"]);
        let sibling = path(&["D:", "Show 2"]);
        for folder in [&old, &nested, &sibling] {
            hide(&connection, folder).unwrap();
        }

        move_within(&connection, &old, &new).unwrap();
        let mut expected = vec![sibling, new.clone(), path(&["E:", "Series", "Show", "Extras"])];
        expected.sort();
        assert_eq!(list(&connection).unwrap(), expected);
        let lower: String = connection
            .query_row(
                "SELECT lower_bound FROM hidden_folders WHERE path = ?1",
                [&new],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(lower, FolderBounds::new(&new).lower);
    }

    #[test]
    fn deletes_only_the_folder_and_what_is_inside_it() {
        let connection = test_support::connection();
        let root = path(&["D:", "Lib"]);
        for folder in [root.clone(), path(&["D:", "Lib", "a"]), path(&["D:", "Lib2"])] {
            hide(&connection, &folder).unwrap();
        }
        delete_within(&connection, &root).unwrap();
        assert_eq!(list(&connection).unwrap(), [path(&["D:", "Lib2"])]);
    }
}
