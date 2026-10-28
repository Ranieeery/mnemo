//! Playable copies: an MP4 copy, made without re-encoding, of a video whose container the built-in player cannot
//! open (an MPEG-TS saved as `.mp4`, for example). The copies live in a folder of the app data with a size limit;
//! `services::media::playable_copy` makes and cleans them up.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::{AppError, AppResult};

pub const BYTES_PER_GB: u64 = 1024 * 1024 * 1024;
pub const DEFAULT_PLAYABLE_COPY_LIMIT_GB: i64 = 5;
pub const MIN_PLAYABLE_COPY_LIMIT_GB: i64 = 1;
pub const MAX_PLAYABLE_COPY_LIMIT_GB: i64 = 200;

/// Copies not played for this long are deleted, whatever the limit.
pub const UNUSED_COPY_LIFETIME: Duration = Duration::from_secs(30 * 24 * 60 * 60);

/// Video codecs the webview decodes from an MP4. Copying the container cannot help any other codec.
const PLAYABLE_VIDEO_CODECS: &[&str] = &["h264", "hevc", "vp9", "av1"];

/// What the player does when a video's container cannot be opened.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PlayableCopyMode {
    /// Explains the situation and asks before making a copy.
    #[default]
    Ask,
    Always,
    Never,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayableCopySettings {
    pub mode: PlayableCopyMode,
    /// Disk space the copies may use together, in GB (binary).
    pub limit_gb: i64,
}

impl Default for PlayableCopySettings {
    fn default() -> Self {
        Self {
            mode: PlayableCopyMode::Ask,
            limit_gb: DEFAULT_PLAYABLE_COPY_LIMIT_GB,
        }
    }
}

pub fn validate_limit_gb(limit_gb: i64) -> AppResult<i64> {
    if (MIN_PLAYABLE_COPY_LIMIT_GB..=MAX_PLAYABLE_COPY_LIMIT_GB).contains(&limit_gb) {
        Ok(limit_gb)
    } else {
        Err(AppError::InvalidInput(format!(
            "the limit for playable copies must be between {MIN_PLAYABLE_COPY_LIMIT_GB} and \
             {MAX_PLAYABLE_COPY_LIMIT_GB} GB"
        )))
    }
}

pub fn limit_bytes(limit_gb: i64) -> u64 {
    limit_gb.unsigned_abs() * BYTES_PER_GB
}

/// A size as the Settings screen shows it, with binary multiples: `1.5 GB`.
pub fn format_gb(bytes: u64) -> String {
    format!("{:.1} GB", bytes as f64 / BYTES_PER_GB as f64)
}

/// A stream codec as ffprobe names it: `h264` and `H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Codec {
    pub name: String,
    pub long_name: String,
}

/// The container of a video and its first video stream, as far as a playable copy needs to know.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContainerStreams {
    /// Human-readable container name, e.g. `MPEG-TS (MPEG-2 Transport Stream)`.
    pub container: String,
    pub video: Option<Codec>,
}

/// Checks that copying the container makes the video playable and fits the limit. The errors explain why not.
pub fn check_copyable(streams: &ContainerStreams, size: u64, limit_gb: i64) -> AppResult<()> {
    let Some(video) = &streams.video else {
        return Err(AppError::InvalidInput("the file has no video stream".into()));
    };
    if !PLAYABLE_VIDEO_CODECS.contains(&video.name.as_str()) {
        return Err(AppError::InvalidInput(format!(
            "its video is {}, which the built-in player can't decode, in any container",
            video.long_name
        )));
    }
    let limit = limit_bytes(limit_gb);
    // Copying the streams keeps their size; the MP4 container is lighter than a transport stream.
    if size > limit {
        return Err(AppError::InvalidInput(format!(
            "a playable copy needs about {}, more than the {} limit for playable copies (Settings > Playback)",
            format_gb(size),
            format_gb(limit)
        )));
    }
    Ok(())
}

/// A finished copy in the copies folder. Its modification time is when it was last played.
#[derive(Debug, Clone)]
pub struct CopyFile {
    pub path: PathBuf,
    pub size: u64,
    pub last_used: SystemTime,
}

/// The copies to delete: those unused for [`UNUSED_COPY_LIFETIME`], then the least recently used until the rest fit
/// in `limit`. `keep` (the copy about to play) is never deleted.
pub fn copies_to_remove(mut copies: Vec<CopyFile>, limit: u64, now: SystemTime, keep: Option<&Path>) -> Vec<PathBuf> {
    copies.sort_by_key(|copy| copy.last_used);
    let mut total: u64 = copies.iter().map(|copy| copy.size).sum();
    let mut removed = Vec::new();
    for copy in copies {
        if keep == Some(copy.path.as_path()) {
            continue;
        }
        let expired = now
            .duration_since(copy.last_used)
            .is_ok_and(|unused| unused >= UNUSED_COPY_LIFETIME);
        if expired || total > limit {
            total -= copy.size;
            removed.push(copy.path);
        }
    }
    removed
}

/// Size of the copies folder, for Settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayableCopiesUsage {
    pub used_bytes: i64,
    pub limit_bytes: i64,
    pub count: i64,
}

/// What clearing the copies did. Copies open in the player cannot be deleted and are kept.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClearedPlayableCopies {
    pub freed_bytes: i64,
    pub kept: i64,
}

/// Whether a video can get a playable copy, before asking the person.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayableCopyCheck {
    /// Human-readable container name of the original.
    pub container: String,
    pub size_bytes: i64,
    /// A copy was already made: playing it costs nothing.
    pub ready: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn codec(name: &str, long_name: &str) -> Option<Codec> {
        Some(Codec {
            name: name.into(),
            long_name: long_name.into(),
        })
    }

    fn streams(video: Option<Codec>) -> ContainerStreams {
        ContainerStreams {
            container: "MPEG-TS (MPEG-2 Transport Stream)".into(),
            video,
        }
    }

    #[test]
    fn copies_videos_the_player_decodes_within_the_limit() {
        let h264 = streams(codec("h264", "H.264"));
        assert!(check_copyable(&h264, 4 * BYTES_PER_GB, 5).is_ok());
        assert!(check_copyable(&streams(codec("hevc", "H.265")), 1, 5).is_ok());
    }

    #[test]
    fn explains_why_a_copy_cannot_help() {
        let xvid = check_copyable(&streams(codec("mpeg4", "MPEG-4 part 2")), 1, 5).unwrap_err();
        assert!(xvid.to_string().contains("MPEG-4 part 2"), "{xvid}");
        let silent = check_copyable(&streams(None), 1, 5).unwrap_err();
        assert!(silent.to_string().contains("no video stream"));
        let large = check_copyable(&streams(codec("h264", "H.264")), 6 * BYTES_PER_GB, 5).unwrap_err();
        assert!(
            large.to_string().contains("6.0 GB") && large.to_string().contains("5.0 GB"),
            "{large}"
        );
    }

    #[test]
    fn limits_stay_in_range() {
        assert_eq!(validate_limit_gb(5).unwrap(), 5);
        assert!(validate_limit_gb(0).is_err());
        assert!(validate_limit_gb(201).is_err());
        assert_eq!(limit_bytes(2), 2 * BYTES_PER_GB);
    }

    fn copy(name: &str, size: u64, days_ago: u64, now: SystemTime) -> CopyFile {
        CopyFile {
            path: PathBuf::from(name),
            size,
            last_used: now - Duration::from_secs(days_ago * 24 * 60 * 60),
        }
    }

    #[test]
    fn removes_copies_unused_for_thirty_days() {
        let now = SystemTime::now();
        let copies = vec![copy("old", 1, 30, now), copy("recent", 1, 29, now)];
        assert_eq!(copies_to_remove(copies, 100, now, None), [PathBuf::from("old")]);
    }

    #[test]
    fn removes_the_least_recently_used_until_the_rest_fit() {
        let now = SystemTime::now();
        let copies = vec![copy("b", 4, 2, now), copy("a", 4, 3, now), copy("c", 4, 1, now)];
        assert_eq!(copies_to_remove(copies, 8, now, None), [PathBuf::from("a")]);
    }

    #[test]
    fn never_removes_the_copy_to_keep() {
        let now = SystemTime::now();
        let copies = vec![copy("playing", 10, 40, now), copy("other", 4, 1, now)];
        assert_eq!(
            copies_to_remove(copies, 8, now, Some(Path::new("playing"))),
            [PathBuf::from("other")]
        );
    }
}
