//! Folders hidden from the home page and the history (see `db::hidden`).

use std::path::Path;

use crate::db::{Db, folders, hidden};
use crate::domain::media::display_name;
use crate::domain::models::HiddenFolder;
use crate::domain::paths::is_within;
use crate::error::AppResult;
use crate::services::library::ensure_in_library;

/// The hidden folders in path order, each with the library folder it belongs to (the innermost one).
pub async fn list(db: &Db) -> AppResult<Vec<HiddenFolder>> {
    let (paths, library) = db
        .call(|connection| Ok((hidden::list(connection)?, folders::list(connection)?)))
        .await?;
    tokio::task::spawn_blocking(move || {
        paths
            .into_iter()
            .filter_map(|path| {
                let folder = Path::new(&path);
                let library_folder = library
                    .iter()
                    .filter(|root| is_within(folder, Path::new(&root.path)))
                    .max_by_key(|root| root.path.len())?
                    .clone();
                Some(HiddenFolder {
                    name: display_name(folder),
                    available: folder.is_dir(),
                    library_folder,
                    path,
                })
            })
            .collect()
    })
    .await
    .map_err(Into::into)
}

/// Hides a folder inside the library from the home page and the history, or shows it again.
pub async fn set_hidden(db: &Db, path: String, hide: bool) -> AppResult<()> {
    db.call(move |connection| {
        ensure_in_library(Path::new(&path), &folders::paths(connection)?)?;
        if hide {
            hidden::hide(connection, &path)
        } else {
            hidden::show(connection, &path)
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::history;
    use crate::db::videos::{self, tests::path};
    use crate::db::watch;
    use crate::domain::folder_order::LibraryFolderSort;
    use crate::error::AppError;
    use crate::services::{folder_order, library, search};

    /// Library folders `Lib` (with `Private/a.mkv`, `Private 2/b.mkv` and `c.mkv`) and `Other` (with `d.mkv`), every
    /// video started and watched once.
    async fn library_with_history() -> Db {
        let db = Db::open_in_memory().unwrap();
        db.call(|connection| {
            folders::add(connection, &path(&["Lib"]))?;
            folders::add(connection, &path(&["Other"]))?;
            for file in [
                path(&["Lib", "Private", "a.mkv"]),
                path(&["Lib", "Private 2", "b.mkv"]),
                path(&["Lib", "c.mkv"]),
                path(&["Other", "d.mkv"]),
            ] {
                let video = videos::tests::add_video(connection, &file, 100.0);
                watch::save_progress(connection, video.id, 95.0, 0.9, false)?;
            }
            Ok(())
        })
        .await
        .unwrap();
        db
    }

    async fn home_paths(db: &Db) -> (Vec<String>, Vec<String>) {
        let home = library::home(db, 10).await.unwrap();
        let recent = home
            .recently_watched
            .iter()
            .map(|video| video.file_path.clone())
            .collect();
        let previews = home
            .folder_previews
            .iter()
            .flat_map(|preview| preview.videos.iter().map(|video| video.file_path.clone()))
            .collect();
        (recent, previews)
    }

    async fn history_paths(db: &Db) -> Vec<String> {
        db.call(|connection| history::list_page(connection, None, 50))
            .await
            .unwrap()
            .entries
            .into_iter()
            .map(|entry| entry.video.file_path)
            .collect()
    }

    #[tokio::test]
    async fn a_hidden_folder_leaves_the_home_search_and_history_and_comes_back_when_shown() {
        let db = library_with_history().await;
        let private = path(&["Lib", "Private"]);
        set_hidden(&db, private.clone(), true).await.unwrap();

        let (recent, previews) = home_paths(&db).await;
        let hidden_video = path(&["Lib", "Private", "a.mkv"]);
        assert_eq!(recent.len(), 3);
        assert!(!recent.contains(&hidden_video));
        assert!(!previews.contains(&hidden_video));
        // A sibling sharing the prefix stays visible.
        assert!(recent.contains(&path(&["Lib", "Private 2", "b.mkv"])));
        assert!(!history_paths(&db).await.contains(&hidden_video));
        let totals = db
            .call(|connection| history::daily_totals(connection, 1))
            .await
            .unwrap();
        assert_eq!(totals[0].videos, 3);
        assert!(
            search::search_library(&db, "a.mkv".into(), 10)
                .await
                .unwrap()
                .is_empty()
        );

        // Progress keeps being recorded while hidden.
        let id = db
            .call(move |connection| Ok(videos::find_by_path(connection, &hidden_video)?.unwrap().id))
            .await
            .unwrap();
        let progress = db
            .call(move |connection| watch::save_progress(connection, id, 20.0, 0.9, false))
            .await
            .unwrap();
        assert_eq!(progress.watch_progress_seconds, 20.0);

        set_hidden(&db, private, false).await.unwrap();
        assert_eq!(home_paths(&db).await.0.len(), 4);
        assert_eq!(history_paths(&db).await.len(), 4);
        assert_eq!(search::search_library(&db, "a.mkv".into(), 10).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_hidden_library_folder_leaves_the_previews_and_stops_counting_as_recently_watched() {
        let db = library_with_history().await;
        folder_order::set_folder_sort(&db, LibraryFolderSort::RecentlyWatched)
            .await
            .unwrap();
        db.call(|connection| {
            connection.execute(
                "UPDATE videos SET last_watched_at = datetime('now', '+1 minute') WHERE file_path = ?1",
                [path(&["Other", "d.mkv"])],
            )?;
            Ok(())
        })
        .await
        .unwrap();
        let names = |folders: Vec<crate::domain::models::LibraryFolder>| {
            folders.into_iter().map(|folder| folder.name).collect::<Vec<_>>()
        };
        assert_eq!(names(folder_order::list_folders(&db).await.unwrap()), ["Other", "Lib"]);

        set_hidden(&db, path(&["Other"]), true).await.unwrap();
        assert_eq!(names(folder_order::list_folders(&db).await.unwrap()), ["Lib", "Other"]);
        let previews = library::home(&db, 10).await.unwrap().folder_previews;
        assert_eq!(previews.len(), 1);
        assert_eq!(previews[0].folder.name, "Lib");
    }

    #[tokio::test]
    async fn a_hidden_folder_inside_a_hidden_one_stays_hidden_when_the_outer_one_is_shown() {
        let db = library_with_history().await;
        let (outer, inner) = (path(&["Lib"]), path(&["Lib", "Private"]));
        set_hidden(&db, inner.clone(), true).await.unwrap();
        set_hidden(&db, outer.clone(), true).await.unwrap();
        assert_eq!(home_paths(&db).await.0, [path(&["Other", "d.mkv"])]);

        set_hidden(&db, outer, false).await.unwrap();
        let listed = list(&db).await.unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(
            (listed[0].path.as_str(), listed[0].name.as_str()),
            (inner.as_str(), "Private")
        );
        assert_eq!(listed[0].library_folder.name, "Lib");
        assert!(!listed[0].available);
        assert_eq!(home_paths(&db).await.0.len(), 3);
    }

    #[tokio::test]
    async fn only_folders_inside_the_library_can_be_hidden() {
        let db = library_with_history().await;
        assert!(matches!(
            set_hidden(&db, path(&["Elsewhere"]), true).await,
            Err(AppError::InvalidInput(_))
        ));
    }

    #[tokio::test]
    async fn removing_a_library_folder_forgets_its_hidden_folders() {
        let db = library_with_history().await;
        set_hidden(&db, path(&["Lib", "Private"]), true).await.unwrap();
        set_hidden(&db, path(&["Other"]), true).await.unwrap();
        let thumbnails = tempfile::tempdir().unwrap();
        library::remove_folder(&db, thumbnails.path(), path(&["Lib"]))
            .await
            .unwrap();
        let listed: Vec<String> = list(&db).await.unwrap().into_iter().map(|folder| folder.path).collect();
        assert_eq!(listed, [path(&["Other"])]);
    }
}
