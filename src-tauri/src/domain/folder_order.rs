//! The order the library folders are listed in: the sidebar, the rail, the home page and Settings.

use std::cmp::Ordering;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use specta::Type;

use super::models::LibraryFolder;
use super::natural_order::natural_cmp;

/// How the library folders are sorted. `Custom` is the order the user arranged (by dragging or moving them), and
/// starts as the order they were added in.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum LibraryFolderSort {
    #[default]
    Custom,
    NameAscending,
    NameDescending,
    NewestFirst,
    OldestFirst,
    /// By the latest time any video inside was watched; folders never watched go last, by name.
    RecentlyWatched,
}

fn by_name(a: &LibraryFolder, b: &LibraryFolder) -> Ordering {
    natural_cmp(&a.name, &b.name)
        .then_with(|| natural_cmp(&a.path, &b.path))
        .then(a.id.cmp(&b.id))
}

/// Folders added in the same second (an import) keep the order of their ids.
fn by_date_added(a: &LibraryFolder, b: &LibraryFolder) -> Ordering {
    a.created_at.cmp(&b.created_at).then(a.id.cmp(&b.id))
}

/// Sorts `folders`, given in the custom order. `last_watched` maps folder ids to the latest `last_watched_at` of their
/// videos (SQLite timestamps, which compare as text) and is only read for `RecentlyWatched`.
pub fn sort_folders(folders: &mut [LibraryFolder], sort: LibraryFolderSort, last_watched: &HashMap<i64, String>) {
    match sort {
        LibraryFolderSort::Custom => {}
        LibraryFolderSort::NameAscending => folders.sort_by(by_name),
        LibraryFolderSort::NameDescending => folders.sort_by(|a, b| by_name(b, a)),
        LibraryFolderSort::OldestFirst => folders.sort_by(by_date_added),
        LibraryFolderSort::NewestFirst => folders.sort_by(|a, b| by_date_added(b, a)),
        LibraryFolderSort::RecentlyWatched => folders.sort_by(|a, b| {
            match (last_watched.get(&a.id), last_watched.get(&b.id)) {
                (Some(a_time), Some(b_time)) => b_time.cmp(a_time),
                (Some(_), None) => Ordering::Less,
                (None, Some(_)) => Ordering::Greater,
                (None, None) => Ordering::Equal,
            }
            .then_with(|| by_name(a, b))
        }),
    }
}

/// The new custom order after a reorder: the `requested` ids that exist, then any folder they left out (added while
/// the user was dragging, say) in its current relative order. Unknown and repeated ids are ignored.
pub fn reordered(current: &[i64], requested: &[i64]) -> Vec<i64> {
    let mut order: Vec<i64> = Vec::with_capacity(current.len());
    for id in requested {
        if current.contains(id) && !order.contains(id) {
            order.push(*id);
        }
    }
    for id in current {
        if !order.contains(id) {
            order.push(*id);
        }
    }
    order
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(id: i64, name: &str, created_at: &str) -> LibraryFolder {
        LibraryFolder {
            id,
            path: format!("D:/{name}"),
            name: name.to_owned(),
            folder_name: name.to_owned(),
            custom_name: None,
            custom_icon: None,
            icon_color: None,
            created_at: Some(created_at.to_owned()),
        }
    }

    fn ids(folders: &[LibraryFolder]) -> Vec<i64> {
        folders.iter().map(|folder| folder.id).collect()
    }

    fn sorted(sort: LibraryFolderSort, last_watched: &HashMap<i64, String>) -> Vec<i64> {
        let mut folders = vec![
            folder(1, "Series 10", "2025-01-02 10:00:00"),
            folder(2, "anime", "2025-01-01 10:00:00"),
            folder(3, "Series 2", "2025-01-03 10:00:00"),
            folder(4, "Movies", "2025-01-02 10:00:00"),
        ];
        sort_folders(&mut folders, sort, last_watched);
        ids(&folders)
    }

    #[test]
    fn custom_keeps_the_stored_order() {
        assert_eq!(sorted(LibraryFolderSort::Custom, &HashMap::new()), [1, 2, 3, 4]);
    }

    #[test]
    fn sorts_by_name_in_natural_order_both_ways() {
        assert_eq!(sorted(LibraryFolderSort::NameAscending, &HashMap::new()), [2, 4, 3, 1]);
        assert_eq!(sorted(LibraryFolderSort::NameDescending, &HashMap::new()), [1, 3, 4, 2]);
    }

    #[test]
    fn sorts_by_date_added_with_the_id_breaking_ties() {
        assert_eq!(sorted(LibraryFolderSort::OldestFirst, &HashMap::new()), [2, 1, 4, 3]);
        assert_eq!(sorted(LibraryFolderSort::NewestFirst, &HashMap::new()), [3, 4, 1, 2]);
    }

    #[test]
    fn name_modes_use_the_custom_name_instead_of_the_folder_name() {
        let mut folders = vec![
            folder(1, "Anime", "x"),
            folder(2, "Zeta", "x"),
            folder(3, "Movies", "x"),
        ];
        folders[0].name = "Watch later".into();
        folders[0].custom_name = Some("Watch later".into());
        folders[1].name = "Courses".into();
        folders[1].custom_name = Some("Courses".into());
        sort_folders(&mut folders, LibraryFolderSort::NameAscending, &HashMap::new());
        assert_eq!(ids(&folders), [2, 3, 1]);
        sort_folders(&mut folders, LibraryFolderSort::NameDescending, &HashMap::new());
        assert_eq!(ids(&folders), [1, 3, 2]);
    }

    #[test]
    fn same_names_are_told_apart_by_path_then_id() {
        let mut folders = vec![
            folder(2, "Videos", "x"),
            folder(1, "Videos", "x"),
            folder(3, "Videos", "x"),
        ];
        folders[0].path = "E:/Videos".into();
        folders[1].path = "E:/Videos".into();
        folders[2].path = "D:/Videos".into();
        sort_folders(&mut folders, LibraryFolderSort::NameAscending, &HashMap::new());
        assert_eq!(ids(&folders), [3, 1, 2]);
    }

    #[test]
    fn recently_watched_first_then_never_watched_by_name() {
        let last_watched = HashMap::from([
            (1, "2025-03-01 08:00:00".to_owned()),
            (3, "2025-03-02 08:00:00".to_owned()),
        ]);
        assert_eq!(sorted(LibraryFolderSort::RecentlyWatched, &last_watched), [3, 1, 2, 4]);
    }

    #[test]
    fn recently_watched_ties_go_by_name() {
        let last_watched = HashMap::from([
            (1, "2025-03-01 08:00:00".to_owned()),
            (4, "2025-03-01 08:00:00".to_owned()),
        ]);
        assert_eq!(sorted(LibraryFolderSort::RecentlyWatched, &last_watched), [4, 1, 2, 3]);
    }

    #[test]
    fn a_single_folder_stays_put_in_every_mode() {
        for sort in [
            LibraryFolderSort::Custom,
            LibraryFolderSort::NameAscending,
            LibraryFolderSort::NameDescending,
            LibraryFolderSort::NewestFirst,
            LibraryFolderSort::OldestFirst,
            LibraryFolderSort::RecentlyWatched,
        ] {
            let mut folders = vec![folder(7, "Only", "2025-01-01 10:00:00")];
            sort_folders(&mut folders, sort, &HashMap::new());
            assert_eq!(ids(&folders), [7]);
        }
    }

    #[test]
    fn reordering_keeps_left_out_folders_and_drops_unknown_ids() {
        assert_eq!(reordered(&[1, 2, 3], &[3, 1, 2]), [3, 1, 2]);
        assert_eq!(reordered(&[1, 2, 3, 4], &[4, 2]), [4, 2, 1, 3]);
        assert_eq!(reordered(&[1, 2], &[9, 2, 2, 1]), [2, 1]);
        assert!(reordered(&[], &[1]).is_empty());
    }
}
