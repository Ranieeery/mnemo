//! File system listing. Synchronous on purpose: callers run it on the blocking thread pool.

use std::fs;
use std::path::{Path, PathBuf};

use crate::domain::media::{display_name, is_video_path};
use crate::domain::natural_order::natural_cmp;
use crate::error::{AppError, AppResult};

/// Direct children of a folder, split by kind and in natural name order.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct DirectoryListing {
    pub folders: Vec<PathBuf>,
    pub videos: Vec<PathBuf>,
    pub other_files: Vec<PathBuf>,
}

pub fn list_directory(path: &Path) -> AppResult<DirectoryListing> {
    let entries = fs::read_dir(path).map_err(|error| AppError::io(path, error))?;
    let mut listing = DirectoryListing::default();
    for entry in entries {
        let entry_path = match entry {
            Ok(entry) => entry.path(),
            Err(error) => {
                tracing::warn!(folder = %path.display(), %error, "skipping unreadable directory entry");
                continue;
            }
        };
        if entry_path.is_dir() {
            listing.folders.push(entry_path);
        } else if is_video_path(&entry_path) {
            listing.videos.push(entry_path);
        } else {
            listing.other_files.push(entry_path);
        }
    }
    for paths in [&mut listing.folders, &mut listing.videos, &mut listing.other_files] {
        sort_by_name(paths);
    }
    Ok(listing)
}

pub fn sort_by_name(paths: &mut [PathBuf]) {
    paths.sort_by(|a, b| natural_cmp(&display_name(a), &display_name(b)));
}

/// Every video below `root`, recursively. `on_folder` is called before each folder is read with the number of files
/// seen so far; returning an error (e.g. [`AppError::Cancelled`]) stops the walk. Unreadable subfolders are skipped
/// and symlinked folders are not followed, which rules out cycles.
pub fn walk_videos(root: &Path, mut on_folder: impl FnMut(&Path, usize) -> AppResult<()>) -> AppResult<Vec<PathBuf>> {
    let mut videos = Vec::new();
    let mut files_seen = 0;
    let mut pending = vec![root.to_path_buf()];
    while let Some(folder) = pending.pop() {
        on_folder(&folder, files_seen)?;
        let entries = match fs::read_dir(&folder) {
            Ok(entries) => entries,
            Err(error) if folder == root => return Err(AppError::io(root, error)),
            Err(error) => {
                tracing::warn!(folder = %folder.display(), %error, "skipping unreadable folder");
                continue;
            }
        };
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else { continue };
            let path = entry.path();
            if file_type.is_dir() {
                pending.push(path);
            } else {
                files_seen += 1;
                if is_video_path(&path) {
                    videos.push(path);
                }
            }
        }
    }
    Ok(videos)
}

#[cfg(test)]
pub(crate) mod tests {
    use std::fs;

    use tempfile::TempDir;

    use super::*;

    /// Creates the given relative files (and their folders) inside a temporary directory.
    pub fn tree(files: &[&str]) -> TempDir {
        let dir = tempfile::tempdir().unwrap();
        for file in files {
            let path = dir.path().join(file);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, b"").unwrap();
        }
        dir
    }

    fn names(paths: &[PathBuf]) -> Vec<String> {
        paths.iter().map(|path| display_name(path)).collect()
    }

    #[test]
    fn lists_direct_children_by_kind_in_natural_order() {
        let dir = tree(&[
            "Ep 10.mkv",
            "Ep 2.mp4",
            "notes.txt",
            "Season 2/a.mkv",
            "Season 10/b.mkv",
        ]);
        let listing = list_directory(dir.path()).unwrap();
        assert_eq!(names(&listing.folders), vec!["Season 2", "Season 10"]);
        assert_eq!(names(&listing.videos), vec!["Ep 2.mp4", "Ep 10.mkv"]);
        assert_eq!(names(&listing.other_files), vec!["notes.txt"]);
    }

    #[test]
    fn missing_folder_is_an_io_error() {
        let dir = tree(&[]);
        assert!(matches!(
            list_directory(&dir.path().join("missing")),
            Err(AppError::Io { .. })
        ));
    }

    #[test]
    fn walks_every_video_recursively() {
        let dir = tree(&["a.mkv", "x/b.mp4", "x/y/c.ts", "x/y/readme.md"]);
        let mut videos = names(&walk_videos(dir.path(), |_, _| Ok(())).unwrap());
        videos.sort();
        assert_eq!(videos, vec!["a.mkv", "b.mp4", "c.ts"]);
    }

    #[test]
    fn walk_stops_when_the_callback_fails() {
        let dir = tree(&["a.mkv", "x/b.mp4"]);
        let mut calls = 0;
        let result = walk_videos(dir.path(), |_, _| {
            calls += 1;
            if calls > 1 { Err(AppError::Cancelled) } else { Ok(()) }
        });
        assert!(matches!(result, Err(AppError::Cancelled)));
    }
}
