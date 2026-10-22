//! The custom order of the library. Folders without a group and groups share one sequence of `sort_order` values;
//! the folders of each group have a sequence of their own. Pinned items come first in their list, in the order of
//! `pin_order` (numbered the same way); their `sort_order` is the place they go back to when unpinned.

use std::collections::HashSet;

use rusqlite::{Connection, params};

use crate::domain::folder_order::with_return_slots;
use crate::domain::models::LayoutEntry;
use crate::error::AppResult;

/// The position after the last item of the list (a folder without a group or a group).
pub const NEXT_TOP_LEVEL: &str = "(SELECT COALESCE(MAX(sort_order) + 1, 0) FROM (
     SELECT sort_order FROM library_folders WHERE group_id IS NULL
     UNION ALL SELECT sort_order FROM library_groups))";

/// The position after the last pinned item of the list (a folder without a group or a group).
pub const NEXT_PINNED_TOP_LEVEL: &str = "(SELECT COALESCE(MAX(pin_order) + 1, 0) FROM (
     SELECT pin_order FROM library_folders WHERE group_id IS NULL
     UNION ALL SELECT pin_order FROM library_groups))";

/// The order shown: pinned items first.
const SHOWN: &str = "unpinned, pin_order, sort_order, created_at";
/// The places in `sort_order`, pinned or not.
const SLOTS: &str = "sort_order, created_at";

/// The stored custom order, pinned items first. Shared positions (after an import) fall back to the date added.
pub fn read(connection: &Connection) -> AppResult<Vec<LayoutEntry>> {
    read_by(connection, SHOWN)
}

/// The custom order by `sort_order` alone, where pinned items keep the place they go back to when unpinned.
fn slots(connection: &Connection) -> AppResult<Vec<LayoutEntry>> {
    read_by(connection, SLOTS)
}

fn read_by(connection: &Connection, order: &str) -> AppResult<Vec<LayoutEntry>> {
    let mut statement = connection.prepare_cached(&format!(
        "SELECT id, 0 AS is_group, pin_order IS NULL AS unpinned, pin_order, sort_order, created_at
         FROM library_folders WHERE group_id IS NULL
         UNION ALL SELECT id, 1, pin_order IS NULL, pin_order, sort_order, created_at FROM library_groups
         ORDER BY {order}, is_group, id"
    ))?;
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

    let mut statement = connection.prepare_cached(&format!(
        "SELECT id, group_id, pin_order IS NULL AS unpinned FROM library_folders WHERE group_id IS NOT NULL
         ORDER BY {order}, id"
    ))?;
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

/// An item of the list, told apart from the others (a folder and a group may share an id).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Item {
    Folder(i64),
    Group(i64),
}

impl Item {
    fn of(entry: &LayoutEntry) -> Self {
        match entry {
            LayoutEntry::Folder { id } => Item::Folder(*id),
            LayoutEntry::Group { id, .. } => Item::Group(*id),
        }
    }
}

fn pinned(connection: &Connection) -> AppResult<HashSet<Item>> {
    let mut statement = connection.prepare_cached(
        "SELECT id, 0 FROM library_folders WHERE pin_order IS NOT NULL
         UNION ALL SELECT id, 1 FROM library_groups WHERE pin_order IS NOT NULL",
    )?;
    let items = statement
        .query_map([], |row| {
            let id = row.get(0)?;
            Ok(if row.get::<_, bool>(1)? {
                Item::Group(id)
            } else {
                Item::Folder(id)
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(items)
}

/// Stores a custom order: the group of every folder it names, and the position of every folder and group. Pinned
/// items are numbered in `pin_order` as they are listed; in `sort_order` they keep the place they go back to when
/// unpinned, and the items not pinned take the other places in their new order (see
/// `folder_order::with_return_slots`). Call it inside a transaction.
pub fn write(connection: &Connection, layout: &[LayoutEntry]) -> AppResult<()> {
    let pinned = pinned(connection)?;
    let is_pinned = |item: &Item| pinned.contains(item);
    let stored = slots(connection)?;

    let mut folder_place =
        connection.prepare_cached("UPDATE library_folders SET group_id = ?2, pin_order = ?3 WHERE id = ?1")?;
    let mut group_place = connection.prepare_cached("UPDATE library_groups SET pin_order = ?2 WHERE id = ?1")?;
    let mut top_pins = 0_i64..;
    for entry in layout {
        let pin = is_pinned(&Item::of(entry)).then(|| top_pins.next()).flatten();
        match entry {
            LayoutEntry::Folder { id } => {
                folder_place.execute(params![id, None::<i64>, pin])?;
            }
            LayoutEntry::Group { id, folders } => {
                group_place.execute(params![id, pin])?;
                let mut pins = 0_i64..;
                for folder in folders {
                    let pin = is_pinned(&Item::Folder(*folder)).then(|| pins.next()).flatten();
                    folder_place.execute(params![folder, id, pin])?;
                }
            }
        }
    }

    let mut folder_order = connection.prepare_cached("UPDATE library_folders SET sort_order = ?2 WHERE id = ?1")?;
    let mut group_order = connection.prepare_cached("UPDATE library_groups SET sort_order = ?2 WHERE id = ?1")?;
    let items: Vec<Item> = layout.iter().map(Item::of).collect();
    let stored_items: Vec<Item> = stored.iter().map(Item::of).collect();
    let order = with_return_slots(&stored_items, &items, is_pinned);
    for (position, item) in order.into_iter().enumerate() {
        match item {
            Item::Folder(id) => folder_order.execute(params![id, position as i64])?,
            Item::Group(id) => group_order.execute(params![id, position as i64])?,
        };
    }
    for entry in layout {
        if let LayoutEntry::Group { id, folders } = entry {
            let stored_folders = stored
                .iter()
                .find_map(|stored| match stored {
                    LayoutEntry::Group { id: group, folders } if group == id => Some(folders.as_slice()),
                    _ => None,
                })
                .unwrap_or_default();
            let order = with_return_slots(stored_folders, folders, |folder| is_pinned(&Item::Folder(*folder)));
            for (position, folder) in order.into_iter().enumerate() {
                folder_order.execute(params![folder, position as i64])?;
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

    fn folder_ids(layout: &[LayoutEntry]) -> Vec<i64> {
        layout
            .iter()
            .flat_map(|entry| match entry {
                LayoutEntry::Folder { id } => vec![*id],
                LayoutEntry::Group { folders, .. } => folders.clone(),
            })
            .collect()
    }

    #[test]
    fn pinned_items_come_first_and_go_back_to_their_place_when_unpinned() {
        let connection = test_support::connection();
        let [a, b, c, d] = ["A", "B", "C", "D"].map(|path| folders::add(&connection, path).unwrap().id);
        folders::set_pinned(&connection, c, true).unwrap();
        folders::set_pinned(&connection, a, true).unwrap();
        // Pinning again changes nothing.
        folders::set_pinned(&connection, c, true).unwrap();
        assert_eq!(folder_ids(&read(&connection).unwrap()), [c, a, b, d]);

        // The pinned ones reordered, and the others too: the pinned keep the places they go back to.
        write(&connection, &[a, c, d, b].map(|id| LayoutEntry::Folder { id })).unwrap();
        assert_eq!(folder_ids(&read(&connection).unwrap()), [a, c, d, b]);
        folders::set_pinned(&connection, c, false).unwrap();
        assert_eq!(folder_ids(&read(&connection).unwrap()), [a, d, c, b]);
        folders::set_pinned(&connection, a, false).unwrap();
        assert_eq!(folder_ids(&read(&connection).unwrap()), [a, d, c, b]);
        // Unpinning an unpinned folder changes nothing either.
        folders::set_pinned(&connection, a, false).unwrap();
        assert_eq!(folder_ids(&read(&connection).unwrap()), [a, d, c, b]);
    }

    #[test]
    fn a_pinned_group_goes_first_and_a_pinned_folder_first_in_its_group() {
        let connection = test_support::connection();
        let a = folders::add(&connection, "A").unwrap().id;
        let series = groups::create(&connection, "Series").unwrap().id;
        let [x, y, z] = ["X", "Y", "Z"].map(|path| folders::add(&connection, path).unwrap().id);
        for folder in [x, y, z] {
            folders::move_to_group(&connection, folder, Some(series)).unwrap();
        }
        folders::set_pinned(&connection, z, true).unwrap();
        // The folder stays in its group, at the top of it.
        assert_eq!(
            read(&connection).unwrap(),
            [
                LayoutEntry::Folder { id: a },
                LayoutEntry::Group {
                    id: series,
                    folders: vec![z, x, y]
                },
            ]
        );
        groups::set_pinned(&connection, series, true).unwrap();
        assert_eq!(
            read(&connection).unwrap(),
            [
                LayoutEntry::Group {
                    id: series,
                    folders: vec![z, x, y]
                },
                LayoutEntry::Folder { id: a },
            ]
        );
        groups::set_pinned(&connection, series, false).unwrap();
        assert_eq!(read(&connection).unwrap()[0], LayoutEntry::Folder { id: a });
        // Both sequences are numbered from 0 again.
        let pins: Vec<Option<i64>> = connection
            .prepare("SELECT pin_order FROM library_folders WHERE pin_order IS NOT NULL")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(pins, [Some(0)]);
    }

    #[test]
    fn moving_a_pinned_folder_keeps_it_pinned_at_the_end_of_the_pinned_ones() {
        let connection = test_support::connection();
        let series = groups::create(&connection, "Series").unwrap().id;
        let courses = groups::create(&connection, "Courses").unwrap().id;
        let [a, b, c] = ["A", "B", "C"].map(|path| folders::add(&connection, path).unwrap().id);
        folders::move_to_group(&connection, b, Some(courses)).unwrap();
        folders::move_to_group(&connection, c, Some(courses)).unwrap();
        folders::set_pinned(&connection, c, true).unwrap();
        folders::set_pinned(&connection, a, true).unwrap();
        folders::move_to_group(&connection, a, Some(courses)).unwrap();
        let courses_entry = LayoutEntry::Group {
            id: courses,
            folders: vec![c, a, b],
        };
        assert_eq!(
            read(&connection).unwrap(),
            [
                LayoutEntry::Group {
                    id: series,
                    folders: vec![]
                },
                courses_entry
            ]
        );

        // Out of the group, it goes to the pinned items of the list.
        folders::move_to_group(&connection, a, None).unwrap();
        assert_eq!(read(&connection).unwrap()[0], LayoutEntry::Folder { id: a });
        folders::move_to_group(&connection, a, Some(series)).unwrap();
        assert_eq!(
            read(&connection).unwrap()[0],
            LayoutEntry::Group {
                id: series,
                folders: vec![a]
            }
        );
        assert!(matches!(
            folders::set_pinned(&connection, 99, true),
            Err(crate::error::AppError::NotFound(_))
        ));
        assert!(matches!(
            groups::set_pinned(&connection, 99, true),
            Err(crate::error::AppError::NotFound(_))
        ));
    }
}
