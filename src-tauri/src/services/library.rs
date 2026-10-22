//! Library folders, folder browsing (both view modes), playlists and the home page.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::db::{Db, folders, hidden, settings, videos};
use crate::domain::folder_color::FolderColor;
use crate::domain::folder_name::normalize_custom_name;
use crate::domain::folder_view::{FolderViewMode, ResolvedViewMode, resolve_view_mode};
use crate::domain::hidden::HiddenFolders;
use crate::domain::media::display_name;
use crate::domain::models::{
    FileEntry, FolderContents, FolderPreview, FolderSummary, HomeData, LibraryFolder, SubfolderEntry, Video,
    VideoEntry, VideoGroup,
};
use crate::domain::natural_order::ReadingKey;
use crate::domain::paths::{is_within, relative_to};
use crate::error::{AppError, AppResult};
use crate::services::folder_order;
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

/// Fails unless every path is a library folder or lies inside one.
pub async fn ensure_all_in_library(db: &Db, paths: Vec<PathBuf>) -> AppResult<()> {
    db.call(move |connection| {
        let library = folders::paths(connection)?;
        paths.iter().try_for_each(|path| ensure_in_library(path, &library))
    })
    .await
}

/// The paths of the library folders.
pub async fn folder_paths(db: &Db) -> AppResult<Vec<String>> {
    db.call(|connection| folders::paths(connection)).await
}

/// A file that exists inside a library folder, for commands that hand paths to the system or to ffmpeg.
pub async fn library_file(db: &Db, path: String) -> AppResult<PathBuf> {
    let path = PathBuf::from(path);
    ensure_all_in_library(db, vec![path.clone()]).await?;
    match tokio::fs::try_exists(&path).await {
        Ok(true) => Ok(path),
        Ok(false) => Err(AppError::NotFound(path.to_string_lossy().into_owned())),
        Err(error) => Err(AppError::io(&path, error)),
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

/// Removes a library folder with its videos, tags, history, view settings and thumbnails. What another library folder
/// still covers stays: everything, when the folder is inside another one, and the contents of library folders nested
/// in it. Returns how many videos were removed.
pub async fn remove_folder(db: &Db, thumbnails_dir: &Path, path: String) -> AppResult<i64> {
    let (count, removed_thumbnails) = db
        .call(move |connection| {
            let transaction = connection.transaction()?;
            folders::remove(&transaction, &path)?;
            let library = folders::paths(&transaction)?;
            let removed = if library.iter().any(|root| is_within(Path::new(&path), Path::new(root))) {
                (0, Vec::new())
            } else {
                let nested: Vec<String> = library
                    .into_iter()
                    .filter(|root| is_within(Path::new(root), Path::new(&path)))
                    .collect();
                folders::clear_view_modes_within(&transaction, &path, &nested)?;
                hidden::delete_within(&transaction, &path, &nested)?;
                videos::delete_in_folder(&transaction, &path, &nested)?
            };
            transaction.commit()?;
            Ok(removed)
        })
        .await?;
    thumbnails::discard(thumbnails_dir, removed_thumbnails).await;
    Ok(count as i64)
}

/// Sets the icon of a library folder and its color (`None`, or a blank icon, restores each default), and remembers the
/// icon for the icon picker.
pub async fn set_folder_appearance(
    db: &Db,
    path: String,
    icon: Option<String>,
    color: Option<FolderColor>,
) -> AppResult<()> {
    let icon = icon.filter(|icon| !icon.trim().is_empty());
    db.call(move |connection| {
        let transaction = connection.transaction()?;
        folders::set_appearance(&transaction, &path, icon.as_deref(), color)?;
        if let Some(icon) = &icon {
            settings::remember_folder_icon(&transaction, icon)?;
        }
        transaction.commit()?;
        Ok(())
    })
    .await
}

/// Renames a library folder in the app only; an empty `name` (or `None`) shows the folder's own name again.
pub async fn rename_folder(db: &Db, path: String, name: Option<String>) -> AppResult<LibraryFolder> {
    db.call(move |connection| {
        let folder = folders::get(connection, &path)?;
        let custom_name = normalize_custom_name(name.as_deref().unwrap_or_default(), &folder.folder_name)?;
        folders::set_custom_name(connection, &path, custom_name.as_deref())?;
        folders::get(connection, &path)
    })
    .await
}

/// Folder icons chosen most recently, newest first.
pub async fn recent_folder_icons(db: &Db) -> AppResult<Vec<String>> {
    db.call(|connection| settings::get::<settings::RecentFolderIcons>(connection))
        .await
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
        walk(db, &folder, &folder).await?
    } else {
        listing.videos
    };
    let groups = video_groups(db, &folder, video_files, continuous).await?;

    let subfolder_paths: Vec<String> = listing
        .folders
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    let (stats, library) = db
        .call(move |connection| {
            let stats = subfolder_paths
                .iter()
                .map(|path| videos::stats_in_folder(connection, path))
                .collect::<AppResult<Vec<_>>>()?;
            Ok((stats, folders::list(connection)?))
        })
        .await?;
    let subfolders = listing
        .folders
        .iter()
        .zip(stats)
        .map(|(path, stats)| {
            let path = path.to_string_lossy().into_owned();
            // A library folder inside the browsed one shows the name it has in the app.
            let name = library
                .iter()
                .find(|folder| folder.path == path)
                .map_or_else(|| display_name(Path::new(&path)), |folder| folder.name.clone());
            SubfolderEntry { name, path, stats }
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
/// continuous view mode was set, without the hidden folders that do not contain the video.
pub async fn playlist(db: &Db, video_path: String) -> AppResult<Vec<VideoEntry>> {
    let parent = Path::new(&video_path)
        .parent()
        .ok_or_else(|| AppError::InvalidInput(format!("{video_path} has no parent folder")))?
        .to_path_buf();
    let view_mode = resolve_in_library(db, &parent).await?;
    let (root, recursive) = match (view_mode.mode, view_mode.defined_at) {
        (FolderViewMode::Continuous, Some(defined_at)) => (PathBuf::from(defined_at), true),
        _ => (parent.clone(), false),
    };
    let files = if recursive {
        walk(db, &root, &parent).await?
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

/// Most videos one home page section holds.
const MAX_HOME_SECTION: i64 = 50;

/// The home page sections (continue watching, recently watched, suggestions and a preview of each library folder),
/// each holding at most `limit` videos (1 to 50).
pub async fn home(db: &Db, limit: i64) -> AppResult<HomeData> {
    if !(1..=MAX_HOME_SECTION).contains(&limit) {
        return Err(AppError::InvalidInput(format!(
            "a home section holds 1 to {MAX_HOME_SECTION} videos, not {limit}"
        )));
    }
    db.call(move |connection| {
        let mut folder_previews = Vec::new();
        for folder in folder_order::sorted_folders(connection)? {
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

/// Every video below `root`, leaving out the hidden folders not in view from `scope` (see [`HiddenFolders`]).
async fn walk(db: &Db, root: &Path, scope: &Path) -> AppResult<Vec<PathBuf>> {
    let hidden = HiddenFolders::new(db.call(|connection| hidden::list(connection)).await?);
    let (root, scope) = (root.to_path_buf(), scope.to_path_buf());
    tokio::task::spawn_blocking(move || {
        scanner::walk_videos(&root, |folder| hidden.conceals(folder, &scope), |_, _| Ok(()))
    })
    .await?
}

/// Groups video files by folder (natural order of the relative path, then of the file name) and attaches the
/// library record of each processed file.
async fn video_groups(db: &Db, root: &Path, files: Vec<PathBuf>, recursive: bool) -> AppResult<Vec<VideoGroup>> {
    let records = records_in(db, root.to_string_lossy().into_owned(), recursive).await?;
    Ok(group_by_folder(root, files, records))
}

/// The library records below `folder` (only directly inside it unless `recursive`), by file path.
pub(crate) async fn records_in(db: &Db, folder: String, recursive: bool) -> AppResult<HashMap<String, Video>> {
    Ok(db
        .call(move |connection| videos::in_folder(connection, &folder, recursive))
        .await?
        .into_iter()
        .map(|video| (video.file_path.clone(), video))
        .collect())
}

/// A video file with its library record, taken out of `records`; `None` when it was not processed yet.
pub(crate) fn video_entry(file: PathBuf, records: &mut HashMap<String, Video>) -> VideoEntry {
    let path = file.to_string_lossy().into_owned();
    VideoEntry {
        name: display_name(&file),
        video: records.remove(&path),
        path,
    }
}

/// The files in reading order (the same order as the home previews), one group per run of files sharing a folder.
fn group_by_folder(root: &Path, mut files: Vec<PathBuf>, mut records: HashMap<String, Video>) -> Vec<VideoGroup> {
    files.sort_by_cached_key(|file| ReadingKey::new(file));
    let mut groups: Vec<VideoGroup> = Vec::new();
    for file in files {
        let folder = file.parent().unwrap_or(root).to_path_buf();
        let folder_path = folder.to_string_lossy().into_owned();
        let entry = video_entry(file, &mut records);
        match groups.last_mut() {
            Some(group) if group.folder_path == folder_path => group.entries.push(entry),
            _ => groups.push(VideoGroup {
                relative_path: relative_to(&folder, root),
                folder_path,
                entries: vec![entry],
            }),
        }
    }
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
                            identity: None,
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
    async fn setting_a_folder_icon_remembers_it_unless_it_is_the_default() {
        let fixture = Fixture::new().await;
        set_folder_appearance(
            &fixture.db,
            fixture.path(&[]),
            Some("film".into()),
            Some(FolderColor::Blue),
        )
        .await
        .unwrap();
        let folders = fixture.db.call(|connection| folders::list(connection)).await.unwrap();
        assert_eq!(folders[0].icon_color, Some(FolderColor::Blue));

        set_folder_appearance(&fixture.db, fixture.path(&[]), None, None)
            .await
            .unwrap();
        let folders = fixture.db.call(|connection| folders::list(connection)).await.unwrap();
        assert_eq!((folders[0].custom_icon.clone(), folders[0].icon_color), (None, None));
        assert_eq!(recent_folder_icons(&fixture.db).await.unwrap(), ["film"]);
    }

    #[tokio::test]
    async fn a_blank_icon_restores_the_default_without_being_remembered() {
        // Regression: an empty icon name was stored and offered first in the icon picker.
        let fixture = Fixture::new().await;
        set_folder_appearance(&fixture.db, fixture.path(&[]), Some("film".into()), None)
            .await
            .unwrap();
        set_folder_appearance(&fixture.db, fixture.path(&[]), Some(" ".into()), None)
            .await
            .unwrap();
        let folders = fixture.db.call(|connection| folders::list(connection)).await.unwrap();
        assert_eq!(folders[0].custom_icon, None);
        assert_eq!(recent_folder_icons(&fixture.db).await.unwrap(), ["film"]);
    }

    #[tokio::test]
    async fn an_unknown_folder_keeps_the_recent_icons_unchanged() {
        let fixture = Fixture::new().await;
        assert!(
            set_folder_appearance(&fixture.db, fixture.path(&["Missing"]), Some("film".into()), None)
                .await
                .is_err()
        );
        assert!(recent_folder_icons(&fixture.db).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn renaming_a_folder_validates_the_name_and_an_empty_one_resets_it() {
        let fixture = Fixture::new().await;
        let renamed = rename_folder(&fixture.db, fixture.path(&[]), Some("  My show \n".into()))
            .await
            .unwrap();
        assert_eq!(
            (
                renamed.name.as_str(),
                renamed.folder_name.as_str(),
                renamed.custom_name.as_deref()
            ),
            ("My show", "Show", Some("My show"))
        );

        let too_long = "a".repeat(crate::domain::folder_name::MAX_FOLDER_NAME_CHARS + 1);
        assert!(matches!(
            rename_folder(&fixture.db, fixture.path(&[]), Some(too_long)).await,
            Err(AppError::InvalidInput(_))
        ));
        let folders = fixture.db.call(|connection| folders::list(connection)).await.unwrap();
        assert_eq!(folders[0].name, "My show");

        for reset in [None, Some("   ".to_owned()), Some("Show".to_owned())] {
            rename_folder(&fixture.db, fixture.path(&[]), Some("Other".into()))
                .await
                .unwrap();
            let reset = rename_folder(&fixture.db, fixture.path(&[]), reset).await.unwrap();
            assert_eq!((reset.name.as_str(), reset.custom_name), ("Show", None));
        }
        assert!(matches!(
            rename_folder(&fixture.db, fixture.path(&["Missing"]), Some("Name".into())).await,
            Err(AppError::NotFound(_))
        ));
    }

    #[tokio::test]
    async fn a_library_folder_inside_the_browsed_one_shows_its_custom_name() {
        let fixture = Fixture::new().await;
        add_folder(&fixture.db, fixture.path(&["Season 2"])).await.unwrap();
        rename_folder(&fixture.db, fixture.path(&["Season 2"]), Some("Best season".into()))
            .await
            .unwrap();
        let contents = browse_folder(&fixture.db, fixture.path(&[])).await.unwrap();
        let subfolders: Vec<_> = contents.subfolders.iter().map(|folder| folder.name.as_str()).collect();
        assert_eq!(subfolders, vec!["Best season", "Season 10"]);
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
    async fn continuous_mode_lists_subfolders_right_after_their_folder() {
        // Regression (B7): whole-path comparison put `Season 10` before `Season 2\Part 1`.
        let fixture = Fixture::new().await;
        let part = std::path::PathBuf::from(fixture.path(&["Season 2", "Part 1"]));
        std::fs::create_dir_all(&part).unwrap();
        std::fs::write(part.join("p1.mkv"), b"").unwrap();
        set_view_mode(&fixture.db, fixture.path(&[]), Some(FolderViewMode::Continuous))
            .await
            .unwrap();
        let contents = browse_folder(&fixture.db, fixture.path(&[])).await.unwrap();

        let groups: Vec<_> = contents
            .groups
            .iter()
            .map(|group| group.relative_path.as_str())
            .collect();
        let part_one = Path::new("Season 2").join("Part 1");
        assert_eq!(groups, vec!["", "Season 2", &part_one.to_string_lossy(), "Season 10"]);
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
    async fn hidden_folders_are_left_out_of_listings_from_above_but_not_from_inside() {
        let fixture = Fixture::new().await;
        let season = fixture.path(&["Season 2"]);
        let hidden_season = season.clone();
        fixture
            .db
            .call(move |connection| hidden::hide(connection, &hidden_season))
            .await
            .unwrap();
        set_view_mode(&fixture.db, fixture.path(&[]), Some(FolderViewMode::Continuous))
            .await
            .unwrap();

        let contents = browse_folder(&fixture.db, fixture.path(&[])).await.unwrap();
        let groups: Vec<_> = contents
            .groups
            .iter()
            .map(|group| group.relative_path.as_str())
            .collect();
        assert_eq!(groups, vec!["", "Season 10"]);
        let inside = browse_folder(&fixture.db, season).await.unwrap();
        assert_eq!(entry_names(&inside.groups[0].entries), vec!["e2.mkv", "e10.mkv"]);

        // From inside the hidden folder the whole tree plays; from outside it is skipped.
        let from_inside = playlist(&fixture.db, fixture.path(&["Season 2", "e2.mkv"]))
            .await
            .unwrap();
        assert_eq!(
            entry_names(&from_inside),
            vec!["extra.mkv", "e2.mkv", "e10.mkv", "e1.mkv"]
        );
        let from_outside = playlist(&fixture.db, fixture.path(&["extra.mkv"])).await.unwrap();
        assert_eq!(entry_names(&from_outside), vec!["extra.mkv", "e1.mkv"]);
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

    impl Fixture {
        /// Stores a video at `parts` with a thumbnail file in `thumbnails_dir`; returns the thumbnail.
        async fn store_with_thumbnail(&self, parts: &[&str], thumbnails_dir: &Path) -> PathBuf {
            let path = self.path(parts);
            let thumbnail = thumbnails_dir.join(format!("{}.jpg", parts.join("_")));
            std::fs::write(&thumbnail, b"jpg").unwrap();
            let stored = thumbnail.to_string_lossy().into_owned();
            self.db
                .call(move |connection| {
                    videos::insert(
                        connection,
                        &NewVideo {
                            file_path: &path,
                            title: "Episode",
                            duration_seconds: 60.0,
                            thumbnail_path: Some(&stored),
                            identity: None,
                        },
                    )
                })
                .await
                .unwrap();
            thumbnail
        }

        /// Library folders, view mode paths, hidden folders and video paths (sorted).
        async fn state(&self) -> (Vec<String>, Vec<String>, Vec<String>, Vec<String>) {
            self.db
                .call(|connection| {
                    let modes = folders::view_modes(connection)?
                        .into_iter()
                        .map(|(path, _)| path)
                        .collect();
                    let videos = connection
                        .prepare("SELECT file_path FROM videos ORDER BY file_path")?
                        .query_map([], |row| row.get(0))?
                        .collect::<Result<_, _>>()?;
                    Ok((folders::paths(connection)?, modes, hidden::list(connection)?, videos))
                })
                .await
                .unwrap()
        }

        async fn hide(&self, parts: &[&str]) {
            let path = self.path(parts);
            self.db
                .call(move |connection| hidden::hide(connection, &path))
                .await
                .unwrap();
        }
    }

    #[tokio::test]
    async fn removing_a_folder_removes_its_videos_settings_and_thumbnails() {
        // Regression: the count was of thumbnails, so videos without one were not counted.
        let fixture = Fixture::new().await;
        let thumbnails_dir = tempfile::tempdir().unwrap();
        let thumbnail = fixture
            .store_with_thumbnail(&["extra.mkv"], thumbnails_dir.path())
            .await;
        set_view_mode(
            &fixture.db,
            fixture.path(&["Season 2"]),
            Some(FolderViewMode::Continuous),
        )
        .await
        .unwrap();
        fixture.hide(&["Season 10"]).await;

        let removed = remove_folder(&fixture.db, thumbnails_dir.path(), fixture.path(&[]))
            .await
            .unwrap();

        assert_eq!(removed, 2);
        assert_eq!(fixture.state().await, Default::default());
        assert!(!thumbnail.exists());
        assert!(home(&fixture.db, 5).await.unwrap().suggestions.is_empty());
    }

    #[tokio::test]
    async fn home_sections_are_bounded() {
        let db = Db::open_in_memory().unwrap();
        for limit in [0, MAX_HOME_SECTION + 1] {
            assert!(matches!(home(&db, limit).await, Err(AppError::InvalidInput(_))));
        }
        assert!(home(&db, MAX_HOME_SECTION).await.is_ok());
    }

    #[tokio::test]
    async fn every_path_must_be_inside_the_library() {
        let fixture = Fixture::new().await;
        let inside = PathBuf::from(fixture.path(&["Season 1"]));
        assert!(ensure_all_in_library(&fixture.db, vec![]).await.is_ok());
        assert!(ensure_all_in_library(&fixture.db, vec![inside.clone()]).await.is_ok());
        assert!(matches!(
            ensure_all_in_library(&fixture.db, vec![inside, PathBuf::from("Z:\\Elsewhere")]).await,
            Err(AppError::InvalidInput(_))
        ));
    }

    #[tokio::test]
    async fn removing_a_folder_keeps_what_a_library_folder_nested_in_it_covers() {
        // Regression: removing `Show` wiped the videos, view modes and hidden folders of `Show/Season 2`, which
        // stayed in the library.
        let fixture = Fixture::new().await;
        let thumbnails_dir = tempfile::tempdir().unwrap();
        add_folder(&fixture.db, fixture.path(&["Season 2"])).await.unwrap();
        let kept_thumbnail = fixture
            .store_with_thumbnail(&["Season 2", "e10.mkv"], thumbnails_dir.path())
            .await;
        for folder in ["Season 2", "Season 10"] {
            set_view_mode(&fixture.db, fixture.path(&[folder]), Some(FolderViewMode::Continuous))
                .await
                .unwrap();
            fixture.hide(&[folder, "Private"]).await;
        }

        let removed = remove_folder(&fixture.db, thumbnails_dir.path(), fixture.path(&[]))
            .await
            .unwrap();

        assert_eq!(removed, 0);
        let season_2 = fixture.path(&["Season 2"]);
        let (folders, modes, hidden, videos) = fixture.state().await;
        assert_eq!(folders, [fixture.path(&["Season 2"])]);
        assert_eq!(modes, [season_2]);
        assert_eq!(hidden, [fixture.path(&["Season 2", "Private"])]);
        assert_eq!(
            videos,
            [
                fixture.path(&["Season 2", "e10.mkv"]),
                fixture.path(&["Season 2", "e2.mkv"])
            ]
        );
        assert!(kept_thumbnail.exists());
    }

    #[tokio::test]
    async fn removing_a_folder_inside_another_library_folder_keeps_its_videos_and_settings() {
        // Regression: removing `Show/Season 2` deleted its videos although `Show` still covers them.
        let fixture = Fixture::new().await;
        let thumbnails_dir = tempfile::tempdir().unwrap();
        add_folder(&fixture.db, fixture.path(&["Season 2"])).await.unwrap();
        set_view_mode(
            &fixture.db,
            fixture.path(&["Season 2"]),
            Some(FolderViewMode::Continuous),
        )
        .await
        .unwrap();
        fixture.hide(&["Season 2", "Private"]).await;

        let removed = remove_folder(&fixture.db, thumbnails_dir.path(), fixture.path(&["Season 2"]))
            .await
            .unwrap();

        assert_eq!(removed, 0);
        let (folders, modes, hidden, videos) = fixture.state().await;
        assert_eq!(folders, [fixture.path(&[])]);
        assert_eq!(modes, [fixture.path(&["Season 2"])]);
        assert_eq!(hidden, [fixture.path(&["Season 2", "Private"])]);
        assert_eq!(videos, [fixture.path(&["Season 2", "e2.mkv"])]);
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

    /// A `Course` library folder with videos directly in it, sibling and nested subfolders and a name that prefixes
    /// another, every video stored and not started. Returns its path.
    async fn course_library(db: &Db, dir: &Path) -> String {
        let files = [
            "Course/Root 10.mkv",
            "Course/Root 2.mkv",
            "Course/Course/Video 10.mkv",
            "Course/Course/Video 2.mkv",
            "Course/Course/Module 1/Video 1.mkv",
            "Course/Course/Module 1/Video 10.mkv",
            "Course/Course/Module 1/Video 2.mkv",
            "Course/Course/Module 2/Video 1.mkv",
            "Course/Course/Private/Video 1.mkv",
            "Course/Course 2/Video 1.mkv",
            "Course/Course_/Video 1.mkv",
        ];
        let paths: Vec<String> = files.iter().map(|file| below(dir, file)).collect();
        for path in &paths {
            std::fs::create_dir_all(Path::new(path).parent().unwrap()).unwrap();
            std::fs::write(path, b"").unwrap();
        }
        let root = below(dir, "Course");
        add_folder(db, root.clone()).await.unwrap();
        let hidden_folder = below(dir, "Course/Course/Private");
        db.call(move |connection| {
            for path in &paths {
                let title = display_name(Path::new(path));
                videos::insert(
                    connection,
                    &NewVideo {
                        file_path: path,
                        title: &title,
                        duration_seconds: 60.0,
                        thumbnail_path: None,
                        identity: None,
                    },
                )?;
            }
            hidden::hide(connection, &hidden_folder)
        })
        .await
        .unwrap();
        root
    }

    /// `relative` (with `/` separators) below `dir`, with the platform's separators.
    fn below(dir: &Path, relative: &str) -> String {
        relative
            .split('/')
            .fold(dir.to_path_buf(), |path, part| path.join(part))
            .to_string_lossy()
            .into_owned()
    }

    async fn preview_paths(db: &Db) -> Vec<String> {
        let previews = home(db, MAX_HOME_SECTION).await.unwrap().folder_previews;
        previews[0].videos.iter().map(|video| video.file_path.clone()).collect()
    }

    #[tokio::test]
    async fn home_preview_follows_the_order_of_the_continuous_view() {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open_in_memory().unwrap();
        let root = course_library(&db, dir.path()).await;
        set_view_mode(&db, root.clone(), Some(FolderViewMode::Continuous))
            .await
            .unwrap();
        let continuous: Vec<String> = browse_folder(&db, root)
            .await
            .unwrap()
            .groups
            .into_iter()
            .flat_map(|group| group.entries)
            .map(|entry| entry.path)
            .collect();

        assert_eq!(continuous.len(), 10);
        assert_eq!(preview_paths(&db).await, continuous);
    }

    #[tokio::test]
    async fn home_preview_of_a_disconnected_folder_keeps_the_tree_order() {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open_in_memory().unwrap();
        let root = course_library(&db, dir.path()).await;
        std::fs::remove_dir_all(&root).unwrap();

        let expected: Vec<String> = [
            "Root 2.mkv",
            "Root 10.mkv",
            "Course/Video 2.mkv",
            "Course/Video 10.mkv",
            "Course/Module 1/Video 1.mkv",
            "Course/Module 1/Video 2.mkv",
            "Course/Module 1/Video 10.mkv",
            "Course/Module 2/Video 1.mkv",
            "Course 2/Video 1.mkv",
            "Course_/Video 1.mkv",
        ]
        .iter()
        .map(|file| below(Path::new(&root), file))
        .collect();
        assert_eq!(preview_paths(&db).await, expected);
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
