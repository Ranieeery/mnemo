//! Locating a library folder that moved outside the app: how well a new location matches the stored videos, and
//! where each video would be there. Files are never moved; only the stored paths change.

use std::path::Path;

use serde::Serialize;
use specta::Type;

use super::models::LibraryFolder;

/// Below this share of stored videos found at the new location, it may not be the same folder.
pub const ENOUGH_FOUND: f64 = 0.5;

/// How well a new location matches the videos stored for a library folder.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum RelocationMatch {
    /// The folder has no stored videos, so there is nothing to compare.
    Empty,
    /// Every stored video is there.
    Complete,
    /// Most stored videos are there.
    Partial,
    /// Few stored videos are there: probably not the same folder.
    Poor,
    /// None of the stored videos is there.
    None,
}

/// What a new location of a library folder would give, before anything changes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RelocationCheck {
    pub from: String,
    pub to: String,
    pub total_videos: i64,
    /// Same relative path and, when it is stored, same size.
    pub found_videos: i64,
    /// Same relative path but another size: a different file.
    pub different_videos: i64,
    pub quality: RelocationMatch,
}

/// A library folder after it was located, with its videos found there once compared with the disk.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RelocationResult {
    pub folder: LibraryFolder,
    pub total_videos: i64,
    pub found_videos: i64,
}

pub fn classify(total: i64, found: i64) -> RelocationMatch {
    if total == 0 {
        RelocationMatch::Empty
    } else if found >= total {
        RelocationMatch::Complete
    } else if found == 0 {
        RelocationMatch::None
    } else if found as f64 / total as f64 >= ENOUGH_FOUND {
        RelocationMatch::Partial
    } else {
        RelocationMatch::Poor
    }
}

/// Where `path`, inside `from`, is when `from` is found at `to`; `None` when `path` is not inside `from`.
pub fn relocated(path: &Path, from: &Path, to: &Path) -> Option<std::path::PathBuf> {
    path.strip_prefix(from).ok().map(|relative| to.join(relative))
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    #[test]
    fn classifies_by_the_share_of_videos_found() {
        assert_eq!(classify(0, 0), RelocationMatch::Empty);
        assert_eq!(classify(150, 150), RelocationMatch::Complete);
        assert_eq!(classify(150, 142), RelocationMatch::Partial);
        assert_eq!(classify(100, 50), RelocationMatch::Partial);
        assert_eq!(classify(100, 49), RelocationMatch::Poor);
        assert_eq!(classify(150, 0), RelocationMatch::None);
    }

    #[test]
    fn maps_a_video_to_the_new_location() {
        let from: PathBuf = ["D:", "Videos"].iter().collect();
        let to: PathBuf = ["E:", "Media", "Videos"].iter().collect();
        let video: PathBuf = ["D:", "Videos", "Show", "Ep 1.mkv"].iter().collect();
        let expected: PathBuf = ["E:", "Media", "Videos", "Show", "Ep 1.mkv"].iter().collect();
        assert_eq!(relocated(&video, &from, &to), Some(expected));

        let elsewhere: PathBuf = ["D:", "Videos 2", "Ep 1.mkv"].iter().collect();
        assert_eq!(relocated(&elsewhere, &from, &to), None);
    }
}
