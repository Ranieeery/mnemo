//! The custom order of the library. Folders without a group and groups share one sequence of `sort_order` values;
//! the folders of each group have a sequence of their own.

use rusqlite::{Connection, params};

use crate::domain::models::LayoutEntry;
use crate::error::AppResult;

/// The position after the last item of the list (a folder without a group or a group).
pub const NEXT_TOP_LEVEL: &str = "(SELECT COALESCE(MAX(sort_order) + 1, 0) FROM (
     SELECT sort_order FROM library_folders WHERE group_id IS NULL
     UNION ALL SELECT sort_order FROM library_groups))";

/// The stored custom order. Shared positions (after an import) fall back to the date added.
pub fn read(connection: &Connection) -> AppResult<Vec<LayoutEntry>> {
    let mut statement = connection.prepare_cached(
        "SELECT id, 0 AS is_group, sort_order, created_at FROM library_folders WHERE group_id IS NULL
         UNION ALL SELECT id, 1, sort_order, created_at FROM library_groups
         ORDER BY sort_order, created_at, is_group, id",
    )?;
    let mut layout: Vec<LayoutEntry> = statement
        .query_map([], |row| {
            let id = row.get(0)?;
            Ok(if row.get::<_, bool>(1)? {
                LayoutEntry::Group {
                    id,
                    folders: Vec::new(),
                }
            } else {
                LayoutEntry::Folder { id }
            })
        })?
        .collect::<Result<_, _>>()?;

    let mut statement = connection.prepare_cached(
        "SELECT id, group_id FROM library_folders WHERE group_id IS NOT NULL ORDER BY sort_order, created_at, id",
    )?;
    let grouped = statement.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))?;
    for row in grouped {
        let (folder, group) = row?;
        for entry in layout.iter_mut() {
            if let LayoutEntry::Group { id, folders } = entry
                && *id == group
            {
                folders.push(folder);
            }
        }
    }
    Ok(layout)
}

/// Stores a custom order: the group and the position of every folder it names, and the position of every group.
/// Call it inside a transaction.
pub fn write(connection: &Connection, layout: &[LayoutEntry]) -> AppResult<()> {
    let mut folder =
        connection.prepare_cached("UPDATE library_folders SET group_id = ?2, sort_order = ?3 WHERE id = ?1")?;
    let mut group = connection.prepare_cached("UPDATE library_groups SET sort_order = ?2 WHERE id = ?1")?;
    for (position, entry) in layout.iter().enumerate() {
        match entry {
            LayoutEntry::Folder { id } => {
                folder.execute(params![id, None::<i64>, position as i64])?;
            }
            LayoutEntry::Group { id, folders } => {
                group.execute(params![id, position as i64])?;
                for (inside, folder_id) in folders.iter().enumerate() {
                    folder.execute(params![folder_id, id, inside as i64])?;
                }
            }
        }
    }
    Ok(())
}

/// Numbers the custom order 0, 1, 2… keeping it, after something was added, removed or moved.
pub fn compact(connection: &Connection) -> AppResult<()> {
    write(connection, &read(connection)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{folders, groups, test_support};

    fn positions(connection: &Connection, table: &str) -> Vec<(i64, i64)> {
        connection
            .prepare(&format!("SELECT id, sort_order FROM {table} ORDER BY id"))
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    #[test]
    fn folders_and_groups_share_the_list_and_each_group_numbers_its_folders() {
        let connection = test_support::connection();
        let a = folders::add(&connection, "A").unwrap().id;
        let series = groups::create(&connection, "Series").unwrap().id;
        let b = folders::add(&connection, "B").unwrap().id;
        let c = folders::add(&connection, "C").unwrap().id;
        assert_eq!(
            read(&connection).unwrap(),
            [
                LayoutEntry::Folder { id: a },
                LayoutEntry::Group {
                    id: series,
                    folders: vec![]
                },
                LayoutEntry::Folder { id: b },
                LayoutEntry::Folder { id: c },
            ]
        );

        let layout = [
            LayoutEntry::Group {
                id: series,
                folders: vec![c, a],
            },
            LayoutEntry::Folder { id: b },
        ];
        write(&connection, &layout).unwrap();
        assert_eq!(read(&connection).unwrap(), layout);
        assert_eq!(positions(&connection, "library_folders"), [(a, 1), (b, 1), (c, 0)]);
        assert_eq!(positions(&connection, "library_groups"), [(series, 0)]);

        // A new item goes after the last one.
        let d = folders::add(&connection, "D").unwrap().id;
        assert_eq!(read(&connection).unwrap().last(), Some(&LayoutEntry::Folder { id: d }));
    }

    #[test]
    fn compacting_closes_gaps_and_settles_shared_positions_by_date_added() {
        let connection = test_support::connection();
        let a = folders::add(&connection, "A").unwrap().id;
        let b = folders::add(&connection, "B").unwrap().id;
        let series = groups::create(&connection, "Series").unwrap().id;
        connection
            .execute_batch(
                "UPDATE library_folders SET sort_order = 7, created_at = '2025-01-02 10:00:00';
                 UPDATE library_folders SET created_at = '2025-01-01 10:00:00' WHERE path = 'B';
                 UPDATE library_groups SET sort_order = 3;",
            )
            .unwrap();
        compact(&connection).unwrap();
        assert_eq!(positions(&connection, "library_folders"), [(a, 2), (b, 1)]);
        assert_eq!(positions(&connection, "library_groups"), [(series, 0)]);
    }
}
