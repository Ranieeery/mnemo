use std::path::Path;

/// File extensions (lowercase, without the dot) recognized as videos. Single source of truth for the whole app.
pub const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpg", "mpeg", "3gp", "ogv", "ts", "mts", "m2ts",
];

/// Subtitle formats looked up next to a video, in priority order.
pub const SUBTITLE_EXTENSIONS: &[&str] = &["srt", "vtt", "sub", "ass"];

/// Returns whether the path has a known video extension (case-insensitive).
pub fn is_video_path(path: &Path) -> bool {
    has_extension_in(path, VIDEO_EXTENSIONS)
}

fn has_extension_in(path: &Path, extensions: &[&str]) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extensions.iter().any(|known| known.eq_ignore_ascii_case(extension)))
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
