//! The order of the library: the chosen sort mode and the custom order of folders and groups.

use std::collections::HashMap;

use rusqlite::Connection;

use crate::db::{Db, folders, groups, layout, settings};
use crate::domain::folder_order::{LibraryFolderSort, arranged, flatten, library_entries, sort_entries};
use crate::domain::models::{LayoutEntry, LibraryEntry, LibraryFolder};
use crate::error::AppResult;

/// The library as listed in the sidebar: folders without a group and groups with their folders, in the order the
/// user chose (the sort mode applies to the list and inside each group).
pub fn library_layout(connection: &Connection) -> AppResult<Vec<LibraryEntry>> {
    let library = folders::list(connection)?;
    let sort = settings::get::<settings::FolderSort>(connection)?;
    let last_watched = if sort == LibraryFolderSort::RecentlyWatched {
        folders::last_watched(connection, &library)?
    } else {
        HashMap::new()
    };
    let mut entries = library_entries(&layout::read(connection)?, library, groups::list(connection)?);
    sort_entries(&mut entries, sort, &last_watched);
    Ok(entries)
}

/// Every library folder in the order of the sidebar: a group's folders where the group is.
pub fn sorted_folders(connection: &Connection) -> AppResult<Vec<LibraryFolder>> {
    Ok(flatten(library_layout(connection)?))
}

pub async fn list_folders(db: &Db) -> AppResult<Vec<LibraryFolder>> {
    db.call(|connection| sorted_folders(connection)).await
}

pub async fn layout(db: &Db) -> AppResult<Vec<LibraryEntry>> {
    db.call(|connection| library_layout(connection)).await
}

pub async fn folder_sort(db: &Db) -> AppResult<LibraryFolderSort> {
    db.call(|connection| settings::get::<settings::FolderSort>(connection))
        .await
}

/// Changes how the library is sorted, returning it in the new order.
pub async fn set_folder_sort(db: &Db, sort: LibraryFolderSort) -> AppResult<Vec<LibraryEntry>> {
    db.call(move |connection| {
        settings::set::<settings::FolderSort>(connection, sort)?;
        library_layout(connection)
    })
    .await
}

/// Stores where folders and groups were moved to (see `folder_order::arranged`) and switches to the custom order, so
/// moving something while another mode is active starts from the order on screen. Returns the library in the new
/// order.
pub async fn arrange(db: &Db, requested: Vec<LayoutEntry>) -> AppResult<Vec<LibraryEntry>> {
    db.call(move |connection| {
        let transaction = connection.transaction()?;
        let order = arranged(&layout::read(&transaction)?, &requested);
        layout::write(&transaction, &order)?;
        settings::set::<settings::FolderSort>(&transaction, LibraryFolderSort::Custom)?;
        let entries = library_layout(&transaction)?;
        transaction.commit()?;
        Ok(entries)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::videos;
    use crate::services::library::home;

    fn folder_names(folders: &[LibraryFolder]) -> Vec<&str> {
        folders.iter().map(|folder| folder.name.as_str()).collect()
    }

    /// The names in list order, a group's folders after it in brackets.
    fn entry_names(entries: &[LibraryEntry]) -> Vec<String> {
        entries
            .iter()
            .map(|entry| match entry {
                LibraryEntry::Folder { folder } => folder.name.clone(),
                LibraryEntry::Group { group, folders } => {
                    format!("{} [{}]", group.name, folder_names(folders).join(", "))
                }
            })
            .collect()
    }

    /// Library folders `Anime`, `Movies` and `Series` (added in that order), each with one video.
    async fn three_folders() -> Db {
        let db = Db::open_in_memory().unwrap();
        db.call(|connection| {
            for name in ["Anime", "Movies", "Series"] {
                folders::add(connection, &videos::tests::path(&["Lib", name]))?;
                videos::tests::add_video(connection, &videos::tests::path(&["Lib", name, "a.mkv"]), 100.0);
            }
            Ok(())
        })
        .await
        .unwrap();
        db
    }

    fn ids(folders: &[LibraryFolder]) -> Vec<i64> {
        folders.iter().map(|folder| folder.id).collect()
    }

    #[tokio::test]
    async fn the_folders_and_the_home_follow_the_chosen_order() {
        let db = three_folders().await;
        assert_eq!(folder_sort(&db).await.unwrap(), LibraryFolderSort::Custom);
        assert_eq!(
            folder_names(&list_folders(&db).await.unwrap()),
            ["Anime", "Movies", "Series"]
        );

        let sorted = set_folder_sort(&db, LibraryFolderSort::NameDescending).await.unwrap();
        assert_eq!(entry_names(&sorted), ["Series", "Movies", "Anime"]);
        let previews = home(&db, 5).await.unwrap().folder_previews;
        let preview_names: Vec<&str> = previews.iter().map(|preview| preview.folder.name.as_str()).collect();
        assert_eq!(preview_names, ["Series", "Movies", "Anime"]);
    }

    #[tokio::test]
    async fn arranging_switches_to_the_custom_order() {
        let db = three_folders().await;
        set_folder_sort(&db, LibraryFolderSort::NameDescending).await.unwrap();
        let on_screen = ids(&list_folders(&db).await.unwrap());
        let moved = [on_screen[1], on_screen[0], on_screen[2]]
            .map(|id| LayoutEntry::Folder { id })
            .to_vec();

        let arranged = arrange(&db, moved).await.unwrap();
        assert_eq!(entry_names(&arranged), ["Movies", "Series", "Anime"]);
        assert_eq!(folder_sort(&db).await.unwrap(), LibraryFolderSort::Custom);
        assert_eq!(layout(&db).await.unwrap(), arranged);
    }

    /// `Movies`, then a group `Shows` with `Series` and `Anime`, then an empty group `Courses`.
    async fn grouped_folders() -> (Db, Vec<LibraryFolder>, i64, i64) {
        let db = three_folders().await;
        let (shows, courses) = db
            .call(|connection| {
                let shows = groups::create(connection, "Shows")?.id;
                let courses = groups::create(connection, "Courses")?.id;
                for name in ["Series", "Anime"] {
                    let folder = folders::find(connection, &videos::tests::path(&["Lib", name]))?;
                    if let Some(folder) = folder {
                        folders::move_to_group(connection, folder.id, Some(shows))?;
                    }
                }
                Ok((shows, courses))
            })
            .await
            .unwrap();
        (db.clone(), list_folders(&db).await.unwrap(), shows, courses)
    }

    #[tokio::test]
    async fn groups_are_sorted_among_the_folders_and_the_home_follows_them() {
        let (db, listed, _, _) = grouped_folders().await;
        assert_eq!(folder_names(&listed), ["Movies", "Series", "Anime"]);
        assert_eq!(
            entry_names(&layout(&db).await.unwrap()),
            ["Movies", "Shows [Series, Anime]", "Courses []"]
        );

        let sorted = set_folder_sort(&db, LibraryFolderSort::NameAscending).await.unwrap();
        assert_eq!(entry_names(&sorted), ["Courses []", "Movies", "Shows [Anime, Series]"]);
        let previews = home(&db, 5).await.unwrap().folder_previews;
        let preview_names: Vec<&str> = previews.iter().map(|preview| preview.folder.name.as_str()).collect();
        assert_eq!(preview_names, ["Movies", "Anime", "Series"]);
    }

    #[tokio::test]
    async fn arranging_moves_folders_in_and_out_of_groups_and_groups_among_folders() {
        let (db, listed, shows, courses) = grouped_folders().await;
        set_folder_sort(&db, LibraryFolderSort::NameAscending).await.unwrap();
        let [movies, series, anime] = [0, 1, 2].map(|index| listed[index].id);

        // Movies dragged into Shows, Series out of it after the group, Courses first; unknown ids are ignored.
        let arranged = arrange(
            &db,
            vec![
                LayoutEntry::Group {
                    id: courses,
                    folders: vec![],
                },
                LayoutEntry::Group {
                    id: shows,
                    folders: vec![anime, movies, 999],
                },
                LayoutEntry::Folder { id: series },
                LayoutEntry::Group {
                    id: 998,
                    folders: vec![],
                },
            ],
        )
        .await
        .unwrap();
        assert_eq!(
            entry_names(&arranged),
            ["Courses []", "Shows [Anime, Movies]", "Series"]
        );
        let LibraryEntry::Group { folders: inside, .. } = &arranged[1] else {
            panic!("Shows is a group");
        };
        assert!(inside.iter().all(|folder| folder.group_id == Some(shows)));
        assert_eq!(folder_sort(&db).await.unwrap(), LibraryFolderSort::Custom);
        assert_eq!(
            folder_names(&list_folders(&db).await.unwrap()),
            ["Anime", "Movies", "Series"]
        );
    }

    #[tokio::test]
    async fn recently_watched_follows_the_latest_watch_without_restarting() {
        let db = three_folders().await;
        set_folder_sort(&db, LibraryFolderSort::RecentlyWatched).await.unwrap();
        // Never watched: by name.
        assert_eq!(
            folder_names(&list_folders(&db).await.unwrap()),
            ["Anime", "Movies", "Series"]
        );

        db.call(|connection| {
            let series = videos::tests::path(&["Lib", "Series", "a.mkv"]);
            let id = videos::find_by_path(connection, &series)?.unwrap().id;
            crate::db::watch::save_progress(connection, id, 10.0, 0.9, false)?;
            Ok(())
        })
        .await
        .unwrap();
        assert_eq!(
            folder_names(&list_folders(&db).await.unwrap()),
            ["Series", "Anime", "Movies"]
        );
    }
}
