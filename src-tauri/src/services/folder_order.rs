//! The order of the library folders: the chosen sort mode and the custom order.

use std::collections::HashMap;

use rusqlite::Connection;

use crate::db::{Db, folders, settings};
use crate::domain::folder_order::{LibraryFolderSort, sort_folders};
use crate::domain::models::LibraryFolder;
use crate::error::AppResult;

/// The library folders in the order the user chose.
pub fn sorted_folders(connection: &Connection) -> AppResult<Vec<LibraryFolder>> {
    let mut list = folders::list(connection)?;
    let sort = settings::get::<settings::FolderSort>(connection)?;
    let last_watched = if sort == LibraryFolderSort::RecentlyWatched {
        folders::last_watched(connection, &list)?
    } else {
        HashMap::new()
    };
    sort_folders(&mut list, sort, &last_watched);
    Ok(list)
}

pub async fn list_folders(db: &Db) -> AppResult<Vec<LibraryFolder>> {
    db.call(|connection| sorted_folders(connection)).await
}

pub async fn folder_sort(db: &Db) -> AppResult<LibraryFolderSort> {
    db.call(|connection| settings::get::<settings::FolderSort>(connection))
        .await
}

/// Changes how the library folders are sorted, returning them in the new order.
pub async fn set_folder_sort(db: &Db, sort: LibraryFolderSort) -> AppResult<Vec<LibraryFolder>> {
    db.call(move |connection| {
        settings::set::<settings::FolderSort>(connection, sort)?;
        sorted_folders(connection)
    })
    .await
}

/// Stores a custom order (folder ids, see `folder_order::reordered`) and switches to it, so moving a folder while
/// another mode is active starts from the order on screen. Returns the folders in the new order.
pub async fn reorder_folders(db: &Db, ids: Vec<i64>) -> AppResult<Vec<LibraryFolder>> {
    db.call(move |connection| {
        let transaction = connection.transaction()?;
        folders::reorder(&transaction, &ids)?;
        settings::set::<settings::FolderSort>(&transaction, LibraryFolderSort::Custom)?;
        let sorted = sorted_folders(&transaction)?;
        transaction.commit()?;
        Ok(sorted)
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

    #[tokio::test]
    async fn the_folders_and_the_home_follow_the_chosen_order() {
        let db = three_folders().await;
        assert_eq!(folder_sort(&db).await.unwrap(), LibraryFolderSort::Custom);
        assert_eq!(
            folder_names(&list_folders(&db).await.unwrap()),
            ["Anime", "Movies", "Series"]
        );

        let sorted = set_folder_sort(&db, LibraryFolderSort::NameDescending).await.unwrap();
        assert_eq!(folder_names(&sorted), ["Series", "Movies", "Anime"]);
        let previews = home(&db, 5).await.unwrap().folder_previews;
        let preview_names: Vec<&str> = previews.iter().map(|preview| preview.folder.name.as_str()).collect();
        assert_eq!(preview_names, ["Series", "Movies", "Anime"]);
    }

    #[tokio::test]
    async fn reordering_switches_to_the_custom_order() {
        let db = three_folders().await;
        set_folder_sort(&db, LibraryFolderSort::NameDescending).await.unwrap();
        let on_screen: Vec<i64> = list_folders(&db)
            .await
            .unwrap()
            .iter()
            .map(|folder| folder.id)
            .collect();
        let moved = [on_screen[1], on_screen[0], on_screen[2]];

        let sorted = reorder_folders(&db, moved.to_vec()).await.unwrap();
        assert_eq!(folder_names(&sorted), ["Movies", "Series", "Anime"]);
        assert_eq!(folder_sort(&db).await.unwrap(), LibraryFolderSort::Custom);
        assert_eq!(list_folders(&db).await.unwrap(), sorted);
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
