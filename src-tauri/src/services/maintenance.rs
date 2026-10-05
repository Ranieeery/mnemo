//! Library statistics and the debug tools of the Settings screen.

use std::path::{Path, PathBuf};

use crate::db::{Db, folders, orphans, tags};
use crate::domain::models::{DatabaseInfo, LibraryStats, TableCount, Video};
use crate::error::AppResult;
use crate::services::media::thumbnails;

const TABLES: &[&str] = &[
    "videos",
    "tags",
    "video_tags",
    "library_folders",
    "watch_history",
    "folder_settings",
    "app_settings",
];

pub async fn library_stats(db: &Db) -> AppResult<LibraryStats> {
    db.call(|connection| {
        let library_folders = folders::paths(connection)?;
        let totals = orphans::library_totals(connection, &library_folders)?;
        Ok(LibraryStats {
            total_videos: totals.total_videos,
            watched_videos: totals.watched_videos,
            total_duration_seconds: totals.total_duration_seconds,
            total_tags: tags::count(connection)?,
            total_folders: library_folders.len() as i64,
            orphaned_videos: totals.orphaned_videos,
        })
    })
    .await
}

pub async fn database_info(db: &Db, database_path: PathBuf) -> AppResult<DatabaseInfo> {
    let size_bytes = tokio::fs::metadata(&database_path)
        .await
        .map(|metadata| metadata.len() as i64)
        .unwrap_or(0);
    db.call(move |connection| {
        let schema_version = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        let tables = TABLES
            .iter()
            .map(|table| {
                let rows = connection.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))?;
                Ok(TableCount {
                    name: (*table).to_owned(),
                    rows,
                })
            })
            .collect::<AppResult<_>>()?;
        Ok(DatabaseInfo {
            path: database_path.to_string_lossy().into_owned(),
            size_bytes,
            schema_version,
            tables,
        })
    })
    .await
}

pub async fn orphaned_videos(db: &Db) -> AppResult<Vec<Video>> {
    db.call(|connection| orphans::orphans(connection, &folders::paths(connection)?))
        .await
}

/// Deletes videos that belong to no library folder, with their thumbnails. Returns how many were removed.
pub async fn clean_orphaned_videos(db: &Db, thumbnails_dir: &Path) -> AppResult<i64> {
    let removed = db
        .call(|connection| {
            let transaction = connection.transaction()?;
            let library_folders = folders::paths(&transaction)?;
            let count = orphans::orphans(&transaction, &library_folders)?.len() as i64;
            let removed_thumbnails = orphans::delete_orphans(&transaction, &library_folders)?;
            transaction.commit()?;
            Ok((count, removed_thumbnails))
        })
        .await?;
    let (count, removed_thumbnails) = removed;
    let thumbnails_dir = thumbnails_dir.to_path_buf();
    tokio::task::spawn_blocking(move || thumbnails::delete(&thumbnails_dir, &removed_thumbnails)).await?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::videos::{self, NewVideo};

    #[tokio::test]
    async fn stats_and_orphan_cleanup() {
        let db = Db::open_in_memory().unwrap();
        let thumbnails_dir = tempfile::tempdir().unwrap();
        let orphan_thumbnail = thumbnails_dir.path().join("orphan.jpg");
        std::fs::write(&orphan_thumbnail, b"").unwrap();
        let orphan_thumbnail_text = orphan_thumbnail.to_string_lossy().into_owned();
        db.call(move |connection| {
            folders::add(connection, "Lib")?;
            for (path, thumbnail) in [
                (videos::tests::path(&["Lib", "a.mkv"]), None),
                (
                    videos::tests::path(&["Gone", "b.mkv"]),
                    Some(orphan_thumbnail_text.as_str()),
                ),
            ] {
                videos::insert(
                    connection,
                    &NewVideo {
                        file_path: &path,
                        title: "v",
                        duration_seconds: 30.0,
                        thumbnail_path: thumbnail,
                    },
                )?;
            }
            Ok(())
        })
        .await
        .unwrap();

        let stats = library_stats(&db).await.unwrap();
        assert_eq!(
            (stats.total_videos, stats.total_folders, stats.orphaned_videos),
            (1, 1, 1)
        );
        assert_eq!(orphaned_videos(&db).await.unwrap().len(), 1);

        assert_eq!(clean_orphaned_videos(&db, thumbnails_dir.path()).await.unwrap(), 1);
        assert!(!orphan_thumbnail.exists());
        assert_eq!(library_stats(&db).await.unwrap().orphaned_videos, 0);

        let info = database_info(&db, thumbnails_dir.path().join("missing.db"))
            .await
            .unwrap();
        assert_eq!(info.schema_version, 2);
        assert_eq!(info.tables.len(), TABLES.len());
    }
}
