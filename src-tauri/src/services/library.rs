//! Library folders, folder browsing (both view modes), playlists and the home page.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::db::{Db, folders, videos};
use crate::domain::folder_view::{FolderViewMode, ResolvedViewMode, resolve_view_mode};
use crate::domain::media::display_name;
use crate::domain::models::{
    FileEntry, FolderContents, FolderPreview, FolderSummary, HomeData, LibraryFolder, SubfolderEntry, Video,
    VideoEntry, VideoGroup,
};
use crate::domain::natural_order::natural_cmp;
use crate::domain::paths::{is_within, relative_to};
use crate::error::{AppError, AppResult};
use crate::services::media::thumbnails;
use crate::services::scanner;

/// Fails unless `path` is a library folder or lies inside one. Keeps commands from touching arbitrary paths.
pub fn ensure_in_library(path: &Path, library_folders: &[String]) -> AppResult<()> {
    if library_folders.iter().any(|folder| is_within(path, Path::new(folder))) {
        Ok(())
    } else {
        Err(AppError::InvalidInput(format!(
            "{} is not inside a library folder",
            path.display()
        )))
    }
}

pub async fn add_folder(db: &Db, path: String) -> AppResult<LibraryFolder> {
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|error| AppError::io(&path, error))?;
    if !metadata.is_dir() {
        return Err(AppError::InvalidInput(format!("{path} is not a folder")));
    }
    db.call(move |connection| folders::add(connection, &path)).await
}

/// Removes a library folder with its videos, tags, history, view settings and thumbnails. Returns how many videos
/// were removed.
pub async fn remove_folder(db: &Db, thumbnails_dir: &Path, path: String) -> AppResult<i64> {
    let removed_thumbnails = db
        .call(move |connection| {
            let transaction = connection.transaction()?;
            let thumbnails = videos::delete_in_folder(&transaction, &path)?;
            folders::remove(&transaction, &path)?;
            folders::clear_view_modes_within(&transaction, &path)?;
            transaction.commit()?;
            Ok(thumbnails)
        })
        .await?;
    let thumbnails_dir = thumbnails_dir.to_path_buf();
    let count = removed_thumbnails.len() as i64;
    tokio::task::spawn_blocking(move || thumbnails::delete(&thumbnails_dir, &removed_thumbnails)).await?;
    Ok(count)
}

pub async fn set_view_mode(db: &Db, path: String, mode: Option<FolderViewMode>) -> AppResult<()> {
    db.call(move |connection| {
        ensure_in_library(Path::new(&path), &folders::paths(connection)?)?;
        folders::set_view_mode(connection, &path, mode)
    })
    .await
}

pub async fn browse_folder(db: &Db, path: String) -> AppResult<FolderContents> {
    let folder = PathBuf::from(&path);
    let view_mode = resolve_in_library(db, &folder).await?;

    let listing_path = folder.clone();
    let listing = tokio::task::spawn_blocking(move || scanner::list_directory(&listing_path)).await??;
    let continuous = view_mode.mode == FolderViewMode::Continuous;
    let video_files = if continuous {
        walk(&folder).await?
    } else {
        listing.videos
    };
    let groups = video_groups(db, &folder, video_files, continuous).await?;

    let subfolder_paths: Vec<String> = listing
        .folders
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    let stats = db
        .call(move |connection| {
            subfolder_paths
                .iter()
                .map(|path| videos::stats_in_folder(connection, path))
                .collect::<AppResult<Vec<_>>>()
        })
        .await?;
    let subfolders = listing
        .folders
        .iter()
        .zip(stats)
        .map(|(path, stats)| SubfolderEntry {
            name: display_name(path),
            path: path.to_string_lossy().into_owned(),
            stats,
        })
        .collect();

    Ok(FolderContents {
        path,
        view_mode,
        subfolders,
        groups,
        other_files: listing
            .other_files
            .iter()
            .map(|path| FileEntry {
                name: display_name(path),
                path: path.to_string_lossy().into_owned(),
            })
            .collect(),
    })
}

/// The videos played in sequence after `video_path`: its folder, or the whole tree of the folder where the
/// continuous view mode was set.
pub async fn playlist(db: &Db, video_path: String) -> AppResult<Vec<VideoEntry>> {
    let parent = Path::new(&video_path)
        .parent()
        .ok_or_else(|| AppError::InvalidInput(format!("{video_path} has no parent folder")))?
        .to_path_buf();
    let view_mode = resolve_in_library(db, &parent).await?;
    let (root, recursive) = match (view_mode.mode, view_mode.defined_at) {
        (FolderViewMode::Continuous, Some(defined_at)) => (PathBuf::from(defined_at), true),
        _ => (parent, false),
    };
    let files = if recursive {
        walk(&root).await?
    } else {
        let listing_root = root.clone();
        tokio::task::spawn_blocking(move || scanner::list_directory(&listing_root))
            .await??
            .videos
    };
    let groups = video_groups(db, &root, files, recursive).await?;
    Ok(groups.into_iter().flat_map(|group| group.entries).collect())
}

pub async fn folder_summary(db: &Db, path: String) -> AppResult<FolderSummary> {
    db.call(move |connection| {
        let stats = videos::stats_in_folder(connection, &path)?;
        Ok(FolderSummary {
            total_videos: stats.total_videos,
            watched_videos: stats.watched_videos,
            tagged_videos: videos::tagged_count_in_folder(connection, &path)?,
        })
    })
    .await
}

pub async fn home(db: &Db, limit: i64) -> AppResult<HomeData> {
    db.call(move |connection| {
        let mut folder_previews = Vec::new();
        for folder in folders::list(connection)? {
            let preview = videos::folder_preview(connection, &folder.path, limit)?;
            if !preview.is_empty() {
                folder_previews.push(FolderPreview {
                    folder,
                    videos: preview,
                });
            }
        }
        Ok(HomeData {
            continue_watching: videos::continue_watching(connection, limit)?,
            recently_watched: videos::recently_watched(connection, limit)?,
            suggestions: videos::suggestions(connection, limit)?,
            folder_previews,
        })
    })
    .await
}

async fn resolve_in_library(db: &Db, folder: &Path) -> AppResult<ResolvedViewMode> {
    let folder = folder.to_path_buf();
    db.call(move |connection| {
        ensure_in_library(&folder, &folders::paths(connection)?)?;
        Ok(resolve_view_mode(&folder, &folders::view_modes(connection)?))
    })
    .await
}

async fn walk(root: &Path) -> AppResult<Vec<PathBuf>> {
    let root = root.to_path_buf();
    tokio::task::spawn_blocking(move || scanner::walk_videos(&root, |_, _| Ok(()))).await?
}

/// Groups video files by folder (natural order of the relative path, then of the file name) and attaches the
/// library record of each processed file.
async fn video_groups(db: &Db, root: &Path, files: Vec<PathBuf>, recursive: bool) -> AppResult<Vec<VideoGroup>> {
    let root_text = root.to_string_lossy().into_owned();
    let mut records: HashMap<String, Video> = db
        .call(move |connection| videos::in_folder(connection, &root_text, recursive))
        .await?
        .into_iter()
        .map(|video| (video.file_path.clone(), video))
        .collect();
    Ok(group_by_folder(root, files, &mut records))
}

fn group_by_folder(root: &Path, files: Vec<PathBuf>, records: &mut HashMap<String, Video>) -> Vec<VideoGroup> {
    let mut by_folder: HashMap<PathBuf, Vec<PathBuf>> = HashMap::new();
    for file in files {
        let folder = file
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| root.to_path_buf());
        by_folder.entry(folder).or_default().push(file);
    }
    let mut groups: Vec<VideoGroup> = by_folder
        .into_iter()
        .map(|(folder, mut files)| {
            scanner::sort_by_name(&mut files);
            VideoGroup {
                relative_path: relative_to(&folder, root),
                folder_path: folder.to_string_lossy().into_owned(),
                entries: files
                    .into_iter()
                    .map(|file| {
                        let path = file.to_string_lossy().into_owned();
                        VideoEntry {
                            name: display_name(&file),
                            video: records.remove(&path),
                            path,
                        }
                    })
                    .collect(),
            }
        })
        .collect();
    groups.sort_by(|a, b| natural_cmp(&a.relative_path, &b.relative_path));
    groups
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::videos::NewVideo;
    use crate::services::scanner::tests::tree;

    struct Fixture {
        db: Db,
        dir: tempfile::TempDir,
    }

    impl Fixture {
        /// A library folder with two seasons, a loose episode and a processed video.
        async fn new() -> Self {
            let dir = tree(&[
                "Show/Season 10/e1.mkv",
                "Show/Season 2/e10.mkv",
                "Show/Season 2/e2.mkv",
                "Show/extra.mkv",
                "Show/cover.jpg",
            ]);
            let db = Db::open_in_memory().unwrap();
            let fixture = Self { db, dir };
            add_folder(&fixture.db, fixture.path(&[])).await.unwrap();
            let processed = fixture.path(&["Season 2", "e2.mkv"]);
            fixture
                .db
                .call(move |connection| {
                    videos::insert(
                        connection,
                        &NewVideo {
                            file_path: &processed,
                            title: "Episode 2",
                            duration_seconds: 60.0,
                            thumbnail_path: None,
                        },
                    )
                })
                .await
                .unwrap();
            fixture
        }

        fn path(&self, parts: &[&str]) -> String {
            parts
                .iter()
                .fold(self.dir.path().join("Show"), |path, part| path.join(part))
                .to_string_lossy()
                .into_owned()
        }
    }

    fn entry_names(entries: &[VideoEntry]) -> Vec<&str> {
        entries.iter().map(|entry| entry.name.as_str()).collect()
    }

    #[tokio::test]
    async fn folders_mode_shows_only_direct_children() {
        let fixture = Fixture::new().await;
        let contents = browse_folder(&fixture.db, fixture.path(&[])).await.unwrap();

        assert_eq!(contents.view_mode.mode, FolderViewMode::Folders);
        let subfolders: Vec<_> = contents.subfolders.iter().map(|folder| folder.name.as_str()).collect();
        assert_eq!(subfolders, vec!["Season 2", "Season 10"]);
        assert_eq!(contents.subfolders[0].stats.total_videos, 1);
        assert_eq!(contents.groups.len(), 1);
        assert_eq!(entry_names(&contents.groups[0].entries), vec!["extra.mkv"]);
        assert_eq!(contents.other_files[0].name, "cover.jpg");
    }

    #[tokio::test]
    async fn continuous_mode_groups_the_tree_in_natural_order() {
        let fixture = Fixture::new().await;
        set_view_mode(&fixture.db, fixture.path(&[]), Some(FolderViewMode::Continuous))
            .await
            .unwrap();
        let contents = browse_folder(&fixture.db, fixture.path(&[])).await.unwrap();

        let groups: Vec<_> = contents
            .groups
            .iter()
            .map(|group| group.relative_path.as_str())
            .collect();
        assert_eq!(groups, vec!["", "Season 2", "Season 10"]);
        let season_two = &contents.groups[1];
        assert_eq!(entry_names(&season_two.entries), vec!["e2.mkv", "e10.mkv"]);
        assert_eq!(
            season_two.entries[0].video.as_ref().map(|video| video.title.as_str()),
            Some("Episode 2")
        );
        assert_eq!(season_two.entries[1].video, None);
    }

    #[tokio::test]
    async fn playlist_follows_the_view_mode() {
        // Regression (B7): the playlist and "Up next" must share one order.
        let fixture = Fixture::new().await;
        let video = fixture.path(&["Season 2", "e2.mkv"]);
        let folder_playlist = playlist(&fixture.db, video.clone()).await.unwrap();
        assert_eq!(entry_names(&folder_playlist), vec!["e2.mkv", "e10.mkv"]);

        set_view_mode(&fixture.db, fixture.path(&[]), Some(FolderViewMode::Continuous))
            .await
            .unwrap();
        let continuous_playlist = playlist(&fixture.db, video).await.unwrap();
        assert_eq!(
            entry_names(&continuous_playlist),
            vec!["extra.mkv", "e2.mkv", "e10.mkv", "e1.mkv"]
        );
    }

    #[tokio::test]
    async fn rejects_paths_outside_the_library() {
        let fixture = Fixture::new().await;
        let outside = fixture.dir.path().to_string_lossy().into_owned();
        assert!(matches!(
            browse_folder(&fixture.db, outside.clone()).await,
            Err(AppError::InvalidInput(_))
        ));
        assert!(matches!(
            set_view_mode(&fixture.db, outside, Some(FolderViewMode::Continuous)).await,
            Err(AppError::InvalidInput(_))
        ));
    }

    #[tokio::test]
    async fn removing_a_folder_removes_its_videos_and_settings() {
        let fixture = Fixture::new().await;
        set_view_mode(
            &fixture.db,
            fixture.path(&["Season 2"]),
            Some(FolderViewMode::Continuous),
        )
        .await
        .unwrap();
        let thumbnails_dir = tempfile::tempdir().unwrap();

        assert_eq!(
            remove_folder(&fixture.db, thumbnails_dir.path(), fixture.path(&[]))
                .await
                .unwrap(),
            0
        );
        let (folders, modes) = fixture
            .db
            .call(|connection| Ok((folders::list(connection)?, folders::view_modes(connection)?)))
            .await
            .unwrap();
        assert!(folders.is_empty() && modes.is_empty());
        assert!(home(&fixture.db, 5).await.unwrap().suggestions.is_empty());
    }

    #[tokio::test]
    async fn adding_a_file_as_library_folder_fails() {
        let fixture = Fixture::new().await;
        let file = fixture.path(&["extra.mkv"]);
        assert!(matches!(
            add_folder(&fixture.db, file).await,
            Err(AppError::InvalidInput(_))
        ));
    }

    #[tokio::test]
    async fn home_includes_previews_of_folders_with_videos() {
        let fixture = Fixture::new().await;
        let home = home(&fixture.db, 5).await.unwrap();
        assert_eq!(home.suggestions.len(), 1);
        assert_eq!(home.folder_previews.len(), 1);
        assert_eq!(home.folder_previews[0].folder.name, "Show");

        let summary = folder_summary(&fixture.db, fixture.path(&[])).await.unwrap();
        assert_eq!(
            summary,
            FolderSummary {
                total_videos: 1,
                watched_videos: 0,
                tagged_videos: 0
            }
        );
    }
}
