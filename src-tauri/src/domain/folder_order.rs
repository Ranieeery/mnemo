//! The order the library is listed in: the sidebar, the rail, the home page and Settings. Folders without a group
//! and groups share one list; each group keeps its folders in a list of their own.

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use specta::Type;

use super::models::{LayoutEntry, LibraryEntry, LibraryFolder, LibraryGroup};
use super::natural_order::natural_cmp;

/// How the library is sorted: the folders without a group and the groups among them, and the folders inside each
/// group. `Custom` is the order the user arranged (by dragging or moving), and starts as the order they were added in.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum LibraryFolderSort {
    #[default]
    Custom,
    NameAscending,
    NameDescending,
    NewestFirst,
    OldestFirst,
    /// By the latest time any video inside was watched (for a group, inside any of its folders); never watched go
    /// last, by name.
    RecentlyWatched,
}

/// What a folder or a group is compared by.
struct SortKey<'a> {
    name: &'a str,
    /// Empty for a group.
    path: &'a str,
    created_at: Option<&'a str>,
    is_group: bool,
    id: i64,
    last_watched: Option<&'a str>,
}

fn folder_key<'a>(folder: &'a LibraryFolder, last_watched: &'a HashMap<i64, String>) -> SortKey<'a> {
    SortKey {
        name: &folder.name,
        path: &folder.path,
        created_at: folder.created_at.as_deref(),
        is_group: false,
        id: folder.id,
        last_watched: last_watched.get(&folder.id).map(String::as_str),
    }
}

fn entry_key<'a>(entry: &'a LibraryEntry, last_watched: &'a HashMap<i64, String>) -> SortKey<'a> {
    match entry {
        LibraryEntry::Folder { folder } => folder_key(folder, last_watched),
        LibraryEntry::Group { group, folders } => SortKey {
            name: &group.name,
            path: "",
            created_at: Some(&group.created_at),
            is_group: true,
            id: group.id,
            last_watched: folders
                .iter()
                .filter_map(|folder| last_watched.get(&folder.id).map(String::as_str))
                .max(),
        },
    }
}

fn by_name(a: &SortKey, b: &SortKey) -> Ordering {
    natural_cmp(a.name, b.name)
        .then_with(|| natural_cmp(a.path, b.path))
        .then(a.is_group.cmp(&b.is_group))
        .then(a.id.cmp(&b.id))
}

/// Items added in the same second (an import) keep the order of their ids.
fn by_date_added(a: &SortKey, b: &SortKey) -> Ordering {
    a.created_at
        .cmp(&b.created_at)
        .then(a.is_group.cmp(&b.is_group))
        .then(a.id.cmp(&b.id))
}

/// Watch times are SQLite timestamps, which compare as text.
fn by_last_watched(a: &SortKey, b: &SortKey) -> Ordering {
    match (a.last_watched, b.last_watched) {
        (Some(a_time), Some(b_time)) => b_time.cmp(a_time),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    }
    .then_with(|| by_name(a, b))
}

/// `None` for `Custom`, which keeps the stored order.
fn comparator(sort: LibraryFolderSort) -> Option<fn(&SortKey, &SortKey) -> Ordering> {
    match sort {
        LibraryFolderSort::Custom => None,
        LibraryFolderSort::NameAscending => Some(by_name),
        LibraryFolderSort::NameDescending => Some(|a, b| by_name(b, a)),
        LibraryFolderSort::OldestFirst => Some(by_date_added),
        LibraryFolderSort::NewestFirst => Some(|a, b| by_date_added(b, a)),
        LibraryFolderSort::RecentlyWatched => Some(by_last_watched),
    }
}

/// Sorts the library, given in the custom order: the items of the list, and the folders inside each group.
/// `last_watched` maps folder ids to the latest `last_watched_at` of their videos and is only read for
/// `RecentlyWatched`.
pub fn sort_entries(entries: &mut [LibraryEntry], sort: LibraryFolderSort, last_watched: &HashMap<i64, String>) {
    let Some(compare) = comparator(sort) else {
        return;
    };
    for entry in entries.iter_mut() {
        if let LibraryEntry::Group { folders, .. } = entry {
            folders.sort_by(|a, b| compare(&folder_key(a, last_watched), &folder_key(b, last_watched)));
        }
    }
    entries.sort_by(|a, b| compare(&entry_key(a, last_watched), &entry_key(b, last_watched)));
}

/// The library in the stored `layout`, with the folders and groups it names. Ids that do not exist are skipped, and
/// folders the layout leaves out go last, without a group.
pub fn library_entries(
    layout: &[LayoutEntry],
    folders: Vec<LibraryFolder>,
    groups: Vec<LibraryGroup>,
) -> Vec<LibraryEntry> {
    let mut folders: HashMap<i64, LibraryFolder> = folders.into_iter().map(|folder| (folder.id, folder)).collect();
    let mut groups: HashMap<i64, LibraryGroup> = groups.into_iter().map(|group| (group.id, group)).collect();
    let mut entries = Vec::with_capacity(layout.len());
    for item in layout {
        match item {
            LayoutEntry::Folder { id } => {
                if let Some(folder) = folders.remove(id) {
                    entries.push(LibraryEntry::Folder { folder });
                }
            }
            LayoutEntry::Group { id, folders: ids } => {
                if let Some(group) = groups.remove(id) {
                    let inside = ids.iter().filter_map(|id| folders.remove(id)).collect();
                    entries.push(LibraryEntry::Group { group, folders: inside });
                }
            }
        }
    }
    let mut left_out: Vec<LibraryFolder> = folders.into_values().collect();
    left_out.sort_by_key(|folder| folder.id);
    entries.extend(left_out.into_iter().map(|folder| LibraryEntry::Folder {
        folder: LibraryFolder {
            group_id: None,
            ..folder
        },
    }));
    entries
}

/// Every folder in list order: a group's folders take its place.
pub fn flatten(entries: Vec<LibraryEntry>) -> Vec<LibraryFolder> {
    entries
        .into_iter()
        .flat_map(|entry| match entry {
            LibraryEntry::Folder { folder } => vec![folder],
            LibraryEntry::Group { folders, .. } => folders,
        })
        .collect()
}

/// The new custom order after an arrangement: the `requested` items that exist in `current`, then anything they left
/// out (added while the user was dragging, say) where it was: an item of the list at the end, a folder at the end
/// of its group. Unknown ids are ignored, and a folder or a group named twice counts where it is named first.
pub fn arranged(current: &[LayoutEntry], requested: &[LayoutEntry]) -> Vec<LayoutEntry> {
    let mut known_groups = HashSet::new();
    let mut known_folders = HashSet::new();
    for item in current {
        match item {
            LayoutEntry::Folder { id } => {
                known_folders.insert(*id);
            }
            LayoutEntry::Group { id, folders } => {
                known_groups.insert(*id);
                known_folders.extend(folders.iter().copied());
            }
        }
    }
    let mut placed = HashSet::new();
    let mut take = |id: i64| known_folders.contains(&id) && placed.insert(id);
    let mut listed = HashSet::new();
    let mut order: Vec<LayoutEntry> = Vec::with_capacity(current.len());
    for item in requested.iter().chain(current) {
        match item {
            LayoutEntry::Folder { id } => {
                if take(*id) {
                    order.push(LayoutEntry::Folder { id: *id });
                }
            }
            LayoutEntry::Group { id, folders } => {
                if known_groups.contains(id) && listed.insert(*id) {
                    let inside = folders.iter().copied().filter(|folder| take(*folder)).collect();
                    order.push(LayoutEntry::Group {
                        id: *id,
                        folders: inside,
                    });
                }
            }
        }
    }
    // Folders of a group that the request listed without them.
    for item in current {
        if let LayoutEntry::Group { id, folders } = item {
            for folder in folders.iter().copied().filter(|folder| take(*folder)) {
                for entry in order.iter_mut() {
                    if let LayoutEntry::Group { id: group, folders } = entry
                        && *group == *id
                    {
                        folders.push(folder);
                    }
                }
            }
        }
    }
    order
}

/// The custom order without a group: its folders take its place, in their order.
pub fn ungrouped(layout: Vec<LayoutEntry>, group_id: i64) -> Vec<LayoutEntry> {
    layout
        .into_iter()
        .flat_map(|item| match item {
            LayoutEntry::Group { id, folders } if id == group_id => {
                folders.into_iter().map(|id| LayoutEntry::Folder { id }).collect()
            }
            item => vec![item],
        })
        .collect()
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
            group_id: None,
            custom_icon: None,
            icon_color: None,
            created_at: Some(created_at.to_owned()),
        }
    }

    fn group(id: i64, name: &str, created_at: &str, folders: Vec<LibraryFolder>) -> LibraryEntry {
        LibraryEntry::Group {
            group: LibraryGroup {
                id,
                name: name.to_owned(),
                collapsed: false,
                created_at: created_at.to_owned(),
            },
            folders: folders
                .into_iter()
                .map(|folder| LibraryFolder {
                    group_id: Some(id),
                    ..folder
                })
                .collect(),
        }
    }

    fn top(folder: LibraryFolder) -> LibraryEntry {
        LibraryEntry::Folder { folder }
    }

    /// The names in list order, a group's folders after it in brackets.
    fn names(entries: &[LibraryEntry]) -> Vec<String> {
        entries
            .iter()
            .map(|entry| match entry {
                LibraryEntry::Folder { folder } => folder.name.clone(),
                LibraryEntry::Group { group, folders } => {
                    let inside: Vec<&str> = folders.iter().map(|folder| folder.name.as_str()).collect();
                    format!("{} [{}]", group.name, inside.join(", "))
                }
            })
            .collect()
    }

    fn ids(folders: &[LibraryFolder]) -> Vec<i64> {
        folders.iter().map(|folder| folder.id).collect()
    }

    fn sorted(sort: LibraryFolderSort, last_watched: &HashMap<i64, String>) -> Vec<i64> {
        let mut entries = vec![
            top(folder(1, "Series 10", "2025-01-02 10:00:00")),
            top(folder(2, "anime", "2025-01-01 10:00:00")),
            top(folder(3, "Series 2", "2025-01-03 10:00:00")),
            top(folder(4, "Movies", "2025-01-02 10:00:00")),
        ];
        sort_entries(&mut entries, sort, last_watched);
        ids(&flatten(entries))
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

    fn mixed() -> Vec<LibraryEntry> {
        vec![
            top(folder(1, "Movies", "2025-01-03 10:00:00")),
            group(
                10,
                "Series",
                "2025-01-02 10:00:00",
                vec![
                    folder(2, "Wire", "2025-01-01 10:00:00"),
                    folder(3, "Dark", "2025-01-05 10:00:00"),
                ],
            ),
            top(folder(4, "Anime", "2025-01-04 10:00:00")),
            group(11, "Courses", "2025-01-06 10:00:00", vec![]),
        ]
    }

    #[test]
    fn groups_are_sorted_among_the_folders_and_their_folders_inside_them() {
        let mut entries = mixed();
        sort_entries(&mut entries, LibraryFolderSort::Custom, &HashMap::new());
        assert_eq!(
            names(&entries),
            ["Movies", "Series [Wire, Dark]", "Anime", "Courses []"]
        );

        sort_entries(&mut entries, LibraryFolderSort::NameAscending, &HashMap::new());
        assert_eq!(
            names(&entries),
            ["Anime", "Courses []", "Movies", "Series [Dark, Wire]"]
        );
        sort_entries(&mut entries, LibraryFolderSort::NameDescending, &HashMap::new());
        assert_eq!(
            names(&entries),
            ["Series [Wire, Dark]", "Movies", "Courses []", "Anime"]
        );

        // A group is as old as the group itself, not its folders.
        sort_entries(&mut entries, LibraryFolderSort::OldestFirst, &HashMap::new());
        assert_eq!(
            names(&entries),
            ["Series [Wire, Dark]", "Movies", "Anime", "Courses []"]
        );
        sort_entries(&mut entries, LibraryFolderSort::NewestFirst, &HashMap::new());
        assert_eq!(
            names(&entries),
            ["Courses []", "Anime", "Movies", "Series [Dark, Wire]"]
        );
    }

    #[test]
    fn a_group_was_watched_when_any_of_its_folders_was() {
        let last_watched = HashMap::from([
            (1, "2025-03-01 08:00:00".to_owned()),
            (2, "2025-03-02 08:00:00".to_owned()),
        ]);
        let mut entries = mixed();
        sort_entries(&mut entries, LibraryFolderSort::RecentlyWatched, &last_watched);
        // Never watched: by name, the empty group among them.
        assert_eq!(
            names(&entries),
            ["Series [Wire, Dark]", "Movies", "Anime", "Courses []"]
        );
    }

    #[test]
    fn a_group_and_a_folder_with_the_same_name_keep_a_stable_order() {
        let mut entries = vec![
            group(1, "Anime", "2025-01-01 10:00:00", vec![]),
            top(folder(1, "Anime", "2025-01-01 10:00:00")),
        ];
        sort_entries(&mut entries, LibraryFolderSort::NameAscending, &HashMap::new());
        let first = names(&entries);
        entries.reverse();
        sort_entries(&mut entries, LibraryFolderSort::NameAscending, &HashMap::new());
        assert_eq!(names(&entries), first);
        sort_entries(&mut entries, LibraryFolderSort::OldestFirst, &HashMap::new());
        assert_eq!(names(&entries), ["Anime", "Anime []"]);
    }

    #[test]
    fn name_modes_use_the_custom_name_instead_of_the_folder_name() {
        let mut folders = [
            folder(1, "Anime", "x"),
            folder(2, "Zeta", "x"),
            folder(3, "Movies", "x"),
        ];
        folders[0].name = "Watch later".into();
        folders[0].custom_name = Some("Watch later".into());
        folders[1].name = "Courses".into();
        folders[1].custom_name = Some("Courses".into());
        let mut entries: Vec<LibraryEntry> = folders.into_iter().map(top).collect();
        sort_entries(&mut entries, LibraryFolderSort::NameAscending, &HashMap::new());
        assert_eq!(names(&entries), ["Courses", "Movies", "Watch later"]);
    }

    #[test]
    fn same_names_are_told_apart_by_path_then_id() {
        let mut folders = [
            folder(2, "Videos", "x"),
            folder(1, "Videos", "x"),
            folder(3, "Videos", "x"),
        ];
        folders[0].path = "E:/Videos".into();
        folders[1].path = "E:/Videos".into();
        folders[2].path = "D:/Videos".into();
        let mut entries: Vec<LibraryEntry> = folders.into_iter().map(top).collect();
        sort_entries(&mut entries, LibraryFolderSort::NameAscending, &HashMap::new());
        assert_eq!(ids(&flatten(entries)), [3, 1, 2]);
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

    fn layout_folder(id: i64) -> LayoutEntry {
        LayoutEntry::Folder { id }
    }

    fn layout_group(id: i64, folders: &[i64]) -> LayoutEntry {
        LayoutEntry::Group {
            id,
            folders: folders.to_vec(),
        }
    }

    #[test]
    fn builds_the_entries_from_the_layout_skipping_unknown_ids() {
        let folders = vec![
            folder(1, "A", "x"),
            folder(2, "B", "x"),
            folder(3, "C", "x"),
            folder(4, "D", "x"),
        ];
        let groups = vec![LibraryGroup {
            id: 10,
            name: "G".into(),
            collapsed: true,
            created_at: "x".into(),
        }];
        let layout = [
            layout_folder(3),
            layout_group(10, &[2, 99]),
            layout_group(98, &[]),
            layout_folder(1),
        ];
        let entries = library_entries(&layout, folders, groups);
        // The folder the layout left out goes last.
        assert_eq!(names(&entries), ["C", "G [B]", "A", "D"]);
        assert_eq!(ids(&flatten(entries)), [3, 2, 1, 4]);
    }

    #[test]
    fn arranging_takes_the_requested_order_and_keeps_what_it_left_out() {
        let current = [
            layout_folder(1),
            layout_group(10, &[2, 3]),
            layout_folder(4),
            layout_group(11, &[5]),
        ];
        // Folder 1 dragged into group 10, folder 3 out of it, group 10 after folder 4.
        let requested = [
            layout_folder(4),
            layout_group(10, &[2, 1]),
            layout_folder(3),
            layout_group(11, &[5]),
        ];
        assert_eq!(arranged(&current, &requested), requested);

        // Left out: folder 4 goes last, group 11 after it, folder 3 back at the end of its group; unknown and
        // repeated ids are ignored.
        let partial = [
            layout_group(10, &[2, 99, 2]),
            layout_folder(1),
            layout_folder(1),
            layout_group(12, &[]),
        ];
        assert_eq!(
            arranged(&current, &partial),
            [
                layout_group(10, &[2, 3]),
                layout_folder(1),
                layout_folder(4),
                layout_group(11, &[5]),
            ]
        );
        assert!(arranged(&[], &requested).is_empty());
    }

    #[test]
    fn a_deleted_group_leaves_its_folders_in_its_place() {
        let layout = vec![layout_folder(1), layout_group(10, &[2, 3]), layout_folder(4)];
        assert_eq!(
            ungrouped(layout, 10),
            [layout_folder(1), layout_folder(2), layout_folder(3), layout_folder(4)]
        );
    }
}
