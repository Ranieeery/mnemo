use std::path::Path;

use crate::domain::models::{SubtitleFile, SubtitleFormat};
use crate::error::{AppError, AppResult};

/// Finds the external subtitle that shares the video's name (`movie.mkv` → `movie.srt`), in format priority order.
/// Non-UTF-8 files (common for older subtitles) are decoded lossily instead of failing.
pub fn find_for(video_path: &Path) -> AppResult<Option<SubtitleFile>> {
    for format in SubtitleFormat::ALL {
        let candidate = video_path.with_extension(format.extension());
        match std::fs::read(&candidate) {
            Ok(bytes) => {
                return Ok(Some(SubtitleFile {
                    format,
                    content: String::from_utf8_lossy(&bytes).into_owned(),
                }));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(AppError::io(&candidate, error)),
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::scanner::tests::tree;

    #[test]
    fn finds_the_first_subtitle_by_priority() {
        let dir = tree(&["movie.mkv", "movie.vtt", "movie.ass", "other.srt"]);
        let found = find_for(&dir.path().join("movie.mkv")).unwrap().unwrap();
        assert_eq!(found.format, SubtitleFormat::Vtt);
    }

    #[test]
    fn decodes_non_utf8_content_lossily() {
        let dir = tree(&["movie.mkv"]);
        std::fs::write(
            dir.path().join("movie.srt"),
            b"1\n00:00:01,000 --> 00:00:02,000\nol\xe1\n",
        )
        .unwrap();
        let found = find_for(&dir.path().join("movie.mkv")).unwrap().unwrap();
        assert_eq!(found.format, SubtitleFormat::Srt);
        assert!(found.content.contains("ol\u{FFFD}"));
    }

    #[test]
    fn returns_none_without_subtitles() {
        let dir = tree(&["movie.mkv"]);
        assert_eq!(find_for(&dir.path().join("movie.mkv")).unwrap(), None);
    }
}
