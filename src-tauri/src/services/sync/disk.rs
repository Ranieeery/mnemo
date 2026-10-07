//! What is on disk below the paths the sync compares, and the path helpers it shares.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use super::identity::is_settled;
use crate::db::presence::KnownFile;
use crate::domain::media::is_video_path;
use crate::domain::paths::is_within;
use crate::error::AppResult;

/// A video file found on disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiskFile {
    pub path: String,
    pub size: i64,
}

#[derive(Debug, Default)]
pub struct DiskScan {
    pub files: Vec<DiskFile>,
    /// Folders (or files) that exist but could not be read: what the library stored there is left alone.
    pub unreadable: Vec<PathBuf>,
}

/// The videos at `path`: the file itself, or every video below it when it is a folder; nothing when it is gone.
/// Synchronous: run it on the blocking thread pool. Symlinked folders are not followed, which rules out cycles.
pub fn scan_path(path: &Path, into: &mut DiskScan) {
    match fs::metadata(path) {
        Err(_) => {}
        Ok(metadata) if metadata.is_dir() => walk(path, into),
        Ok(metadata) => {
            if is_video_path(path) {
                into.files.push(DiskFile {
                    path: path.to_string_lossy().into_owned(),
                    size: metadata.len() as i64,
                });
            }
        }
    }
}

fn walk(root: &Path, into: &mut DiskScan) {
    let mut pending = vec![root.to_path_buf()];
    while let Some(folder) = pending.pop() {
        let Ok(entries) = fs::read_dir(&folder) else {
            into.unreadable.push(folder);
            continue;
        };
        for entry in entries {
            let Ok(entry) = entry else {
                into.unreadable.push(folder.clone());
                continue;
            };
            let path = entry.path();
            if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                pending.push(path);
            } else if is_video_path(&path) {
                match fs::metadata(&path) {
                    Ok(metadata) if metadata.is_file() => into.files.push(DiskFile {
                        path: path.to_string_lossy().into_owned(),
                        size: metadata.len() as i64,
                    }),
                    Ok(_) => {}
                    Err(_) => into.unreadable.push(path),
                }
            }
        }
    }
}

/// Leaves out of the scan the new files that are still growing or locked (being copied) and returns them.
pub async fn settle_new_files(known: &[KnownFile], scan: &mut DiskScan, settle: Duration) -> AppResult<Vec<PathBuf>> {
    let stored: HashSet<&str> = known.iter().map(|video| video.path.as_str()).collect();
    let new_files: Vec<DiskFile> = scan
        .files
        .iter()
        .filter(|file| !stored.contains(file.path.as_str()))
        .cloned()
        .collect();
    if new_files.is_empty() || settle.is_zero() {
        return Ok(Vec::new());
    }
    tokio::time::sleep(settle).await;
    let unsettled: HashSet<String> = tokio::task::spawn_blocking(move || {
        new_files
            .into_iter()
            .filter(|file| !is_settled(Path::new(&file.path), file.size))
            .map(|file| file.path)
            .collect()
    })
    .await?;
    scan.files.retain(|file| !unsettled.contains(&file.path));
    Ok(unsettled.into_iter().map(PathBuf::from).collect())
}

/// The library folder that contains `path`.
pub fn root_of<'a>(path: &Path, library: &'a [String]) -> Option<&'a String> {
    library.iter().find(|root| is_within(path, Path::new(root)))
}

/// Drops the paths inside other paths of the list, and repeats.
pub fn outermost(mut paths: Vec<PathBuf>) -> Vec<PathBuf> {
    paths.sort();
    paths.dedup();
    let mut kept: Vec<PathBuf> = Vec::with_capacity(paths.len());
    for path in paths {
        if !kept.iter().any(|outer| is_within(&path, outer)) {
            kept.retain(|inner| !is_within(inner, &path));
            kept.push(path);
        }
    }
    kept
}
