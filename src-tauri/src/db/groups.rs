//! Groups of library folders. A folder belongs to at most one (`library_folders.group_id`); deleting a group leaves
//! its folders without one. Groups are listed among the folders without a group (see `layout`).

use rusqlite::{Connection, OptionalExtension, Row, params};

use super::layout::{self, NEXT_TOP_LEVEL};
use crate::domain::folder_order::ungrouped;
use crate::domain::models::LibraryGroup;
use crate::error::{AppError, AppResult};

/// The columns [`map_group`] reads, in its order.
const COLUMNS: &str = "id, name, collapsed, created_at";

fn map_group(row: &Row) -> rusqlite::Result<LibraryGroup> {
    Ok(LibraryGroup {
        id: row.get(0)?,
        name: row.get(1)?,
        collapsed: row.get(2)?,
        created_at: row.get(3)?,
    })
}

/// The groups, in the order they were created (see `layout` for the custom order).
pub fn list(connection: &Connection) -> AppResult<Vec<LibraryGroup>> {
    let mut statement =
        connection.prepare_cached(&format!("SELECT {COLUMNS} FROM library_groups ORDER BY created_at, id"))?;
    let groups = statement.query_map([], map_group)?.collect::<Result<_, _>>()?;
    Ok(groups)
}

pub fn find(connection: &Connection, id: i64) -> AppResult<LibraryGroup> {
    connection
        .query_row(
            &format!("SELECT {COLUMNS} FROM library_groups WHERE id = ?1"),
            [id],
            map_group,
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("library group {id}")))
}

/// Adds a group at the end of the list. `name` must already be normalized.
pub fn create(connection: &Connection, name: &str) -> AppResult<LibraryGroup> {
    connection.execute(
        &format!("INSERT INTO library_groups (name, sort_order) VALUES (?1, {NEXT_TOP_LEVEL})"),
        [name],
    )?;
    find(connection, connection.last_insert_rowid())
}

/// `name` must already be normalized.
pub fn rename(connection: &Connection, id: i64, name: &str) -> AppResult<()> {
    update(
        connection,
        id,
        "UPDATE library_groups SET name = ?2 WHERE id = ?1",
        name,
    )
}

pub fn set_collapsed(connection: &Connection, id: i64, collapsed: bool) -> AppResult<()> {
    update(
        connection,
        id,
        "UPDATE library_groups SET collapsed = ?2 WHERE id = ?1",
        collapsed,
    )
}

fn update(connection: &Connection, id: i64, sql: &str, value: impl rusqlite::ToSql) -> AppResult<()> {
    if connection.execute(sql, params![id, value])? == 0 {
        return Err(AppError::NotFound(format!("library group {id}")));
    }
    Ok(())
}

/// Deletes a group; its folders stay where it was, without a group. Returns how many folders it had. Call it inside
/// a transaction.
pub fn delete(connection: &Connection, id: i64) -> AppResult<i64> {
    find(connection, id)?;
    let folders: i64 = connection.query_row(
        "SELECT COUNT(*) FROM library_folders WHERE group_id = ?1",
        [id],
        |row| row.get(0),
    )?;
    layout::write(connection, &ungrouped(layout::read(connection)?, id))?;
    connection.execute("DELETE FROM library_groups WHERE id = ?1", [id])?;
    layout::compact(connection)?;
    Ok(folders)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{folders, test_support};
    use crate::domain::models::LayoutEntry;

    #[test]
    fn creates_renames_and_collapses_groups() {
        let connection = test_support::connection();
        let series = create(&connection, "Series").unwrap();
        let courses = create(&connection, "Courses").unwrap();
        // Several groups may share a name.
        let other = create(&connection, "Series").unwrap();
        assert!(!series.collapsed);

        rename(&connection, other.id, "Movies").unwrap();
        set_collapsed(&connection, courses.id, true).unwrap();
        let names: Vec<String> = list(&connection).unwrap().into_iter().map(|group| group.name).collect();
        assert_eq!(names, ["Series", "Courses", "Movies"]);
        assert!(find(&connection, courses.id).unwrap().collapsed);

        assert!(matches!(rename(&connection, 99, "X"), Err(AppError::NotFound(_))));
        assert!(matches!(
            set_collapsed(&connection, 99, true),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn deleting_a_group_leaves_its_folders_in_its_place_without_a_group() {
        let connection = test_support::connection();
        let first = folders::add(&connection, "First").unwrap().id;
        let series = create(&connection, "Series").unwrap();
        let courses = create(&connection, "Courses").unwrap();
        let last = folders::add(&connection, "Last").unwrap().id;
        let show = folders::add(&connection, "Show").unwrap().id;
        let other = folders::add(&connection, "Other").unwrap().id;
        folders::move_to_group(&connection, show, Some(series.id)).unwrap();
        folders::move_to_group(&connection, other, Some(series.id)).unwrap();

        assert_eq!(delete(&connection, series.id).unwrap(), 2);
        assert_eq!(delete(&connection, courses.id).unwrap(), 0);
        assert_eq!(
            layout::read(&connection).unwrap(),
            [first, show, other, last].map(|id| LayoutEntry::Folder { id })
        );
        assert!(list(&connection).unwrap().is_empty());
        assert!(matches!(delete(&connection, series.id), Err(AppError::NotFound(_))));
    }
}
