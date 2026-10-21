use std::path::Path;

/// File extensions (lowercase, without the dot) recognized as videos. Single source of truth for the whole app.
pub const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpg", "mpeg", "3gp", "ogv", "ts", "mts", "m2ts",
];

/// Bytes read from a `.ts` file to tell an MPEG transport stream (188-byte packets that start with the sync byte
/// `0x47`) from a TypeScript source file, which shares the extension.
pub const TRANSPORT_STREAM_HEAD_LENGTH: usize = 189;
const TRANSPORT_STREAM_SYNC_BYTE: u8 = 0x47;

/// What recognizes a video file after a rename or move: its size and a hash of its head and tail
/// (`services::sync::identity`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileIdentity {
    pub size: i64,
    pub fingerprint: String,
}

/// Returns whether the path has a known video extension (case-insensitive).
pub fn is_video_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            VIDEO_EXTENSIONS
                .iter()
                .any(|known| known.eq_ignore_ascii_case(extension))
        })
}

/// Returns whether the extension alone cannot tell the file is a video (`.ts`), so its head must be checked with
/// [`is_transport_stream_head`].
pub fn needs_content_check(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("ts"))
}

/// Returns whether the first [`TRANSPORT_STREAM_HEAD_LENGTH`] bytes of a `.ts` file (or fewer, for a short file) can
/// be an MPEG transport stream. An empty head cannot tell yet (a file just created by a copy), so it counts.
pub fn is_transport_stream_head(head: &[u8]) -> bool {
    let is_sync = |index: usize| head.get(index).is_none_or(|byte| *byte == TRANSPORT_STREAM_SYNC_BYTE);
    is_sync(0) && is_sync(TRANSPORT_STREAM_HEAD_LENGTH - 1)
}

/// How many videos the pipeline reads at once: half the CPU cores, between 1 and 4. ffmpeg already uses several
/// threads per file, and more parallel reads would mostly wait on the disk (often an external drive).
pub fn processing_concurrency(cores: usize) -> usize {
    (cores / 2).clamp(1, 4)
}

/// Default title for a newly found video: its file name without the extension.
pub fn title_from_path(path: &Path) -> String {
    path.file_stem()
        .or_else(|| path.file_name())
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Display name of a file or folder: the last path component, or the whole path for roots like `D:\`.
pub fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_half_the_cores_at_once_within_limits() {
        assert_eq!(processing_concurrency(1), 1);
        assert_eq!(processing_concurrency(2), 1);
        assert_eq!(processing_concurrency(6), 3);
        assert_eq!(processing_concurrency(8), 4);
        assert_eq!(processing_concurrency(32), 4);
    }

    #[test]
    fn recognizes_every_video_extension_case_insensitively() {
        for extension in VIDEO_EXTENSIONS {
            assert!(is_video_path(Path::new(&format!("movie.{extension}"))), "{extension}");
            let upper = extension.to_uppercase();
            assert!(is_video_path(Path::new(&format!("movie.{upper}"))), "{upper}");
        }
    }

    #[test]
    fn includes_transport_stream_and_ogv_extensions() {
        for extension in ["ts", "mts", "m2ts", "ogv"] {
            assert!(VIDEO_EXTENSIONS.contains(&extension));
        }
    }

    #[test]
    fn only_ts_files_need_their_content_checked() {
        assert!(needs_content_check(Path::new("recording.ts")));
        assert!(needs_content_check(Path::new("RECORDING.TS")));
        for name in ["movie.mts", "movie.m2ts", "movie.mkv", "index.tsx"] {
            assert!(!needs_content_check(Path::new(name)), "{name}");
        }
    }

    #[test]
    fn tells_transport_streams_from_typescript() {
        let mut packets = vec![0u8; TRANSPORT_STREAM_HEAD_LENGTH];
        packets[0] = 0x47;
        packets[188] = 0x47;
        assert!(is_transport_stream_head(&packets));
        assert!(is_transport_stream_head(&packets[..100]), "a short stream");
        assert!(is_transport_stream_head(&[]), "a file still being created");

        assert!(!is_transport_stream_head(b"export const answer = 42;\n"));
        packets[188] = b'G' + 1;
        assert!(!is_transport_stream_head(&packets), "a text file that starts with G");
    }

    #[test]
    fn rejects_non_video_files() {
        for name in ["notes.txt", "cover.jpg", "movie.srt", "README", "archive.mp4.part"] {
            assert!(!is_video_path(Path::new(name)), "{name}");
        }
    }

    #[test]
    fn title_is_the_file_stem() {
        assert_eq!(title_from_path(Path::new("Show/S01E02 - Pilot.mkv")), "S01E02 - Pilot");
        assert_eq!(title_from_path(Path::new("no-extension")), "no-extension");
    }

    #[test]
    fn display_name_is_the_last_component() {
        assert_eq!(display_name(Path::new("Videos/Series")), "Series");
    }
}
