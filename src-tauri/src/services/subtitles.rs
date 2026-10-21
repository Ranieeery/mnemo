use std::path::Path;

use crate::db::Db;
use crate::domain::models::{SubtitleFile, SubtitleFormat};
use crate::error::{AppError, AppResult};
use crate::services::library::library_file;

/// The external subtitle next to a library video, if any. Fails for paths outside the library.
pub async fn find_for_video(db: &Db, video_path: String) -> AppResult<Option<SubtitleFile>> {
    let video = library_file(db, video_path).await?;
    tokio::task::spawn_blocking(move || find_for(&video)).await?
}

/// Finds the external subtitle that shares the video's name (`movie.mkv` → `movie.srt`), in format priority order.
/// Non-UTF-8 files (common for older subtitles) are decoded lossily instead of failing.
fn find_for(video_path: &Path) -> AppResult<Option<SubtitleFile>> {
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
    use crate::services::library::add_folder;
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

    #[tokio::test]
    async fn only_reads_subtitles_of_library_videos() {
        // Regression: the command read the sibling subtitle files of any path.
        let library = tree(&["Show/movie.mkv", "Show/movie.srt"]);
        let elsewhere = tree(&["other.mkv", "other.srt"]);
        let db = Db::open_in_memory().unwrap();
        add_folder(&db, library.path().join("Show").to_string_lossy().into_owned())
            .await
            .unwrap();
        let inside = library.path().join("Show").join("movie.mkv");
        let climbing = library.path().join("Show").join("..").join("Show").join("movie.mkv");

        let found = find_for_video(&db, inside.to_string_lossy().into_owned())
            .await
            .unwrap();
        assert_eq!(found.map(|file| file.format), Some(SubtitleFormat::Srt));
        for path in [elsewhere.path().join("other.mkv"), climbing] {
            let result = find_for_video(&db, path.to_string_lossy().into_owned()).await;
            assert!(matches!(result, Err(AppError::InvalidInput(_))), "{}", path.display());
        }
    }
}
