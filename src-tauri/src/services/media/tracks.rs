//! Audio and subtitle streams embedded in a video, and extraction of its text subtitles.

use super::TrackToolkit;
use crate::db::Db;
use crate::domain::models::{MediaTracks, SubtitleFile, SubtitleFormat};
use crate::error::{AppError, AppResult};
use crate::services::library::library_file;

/// The audio and subtitle streams of a library video.
pub async fn list_tracks<T: TrackToolkit>(db: &Db, toolkit: &T, path: String) -> AppResult<MediaTracks> {
    let file = library_file(db, path).await?;
    toolkit.tracks(&file).await
}

/// One of the video's text subtitle streams: ASS/SSA as ASS (whose override tags the player's parser removes),
/// everything else as WebVTT. Image subtitles are refused: they cannot be turned into text.
pub async fn extract_subtitle<T: TrackToolkit>(
    db: &Db,
    toolkit: &T,
    path: String,
    index: i64,
) -> AppResult<SubtitleFile> {
    let file = library_file(db, path).await?;
    let tracks = toolkit.tracks(&file).await?;
    let track = tracks
        .subtitles
        .iter()
        .find(|track| track.index == index)
        .ok_or_else(|| AppError::InvalidInput(format!("the video has no subtitle track {index}")))?;
    if !track.is_text {
        return Err(AppError::InvalidInput(format!(
            "subtitle track {index} is made of images ({}), which cannot be shown as text",
            track.codec
        )));
    }
    let format = if matches!(track.codec.as_str(), "ass" | "ssa") {
        SubtitleFormat::Ass
    } else {
        SubtitleFormat::Vtt
    };
    let content = toolkit.extract_subtitle(&file, index, format).await?;
    Ok(SubtitleFile { format, content })
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::sync::Mutex;

    use super::*;
    use crate::domain::models::SubtitleTrack;
    use crate::services::library::add_folder;
    use crate::services::scanner::tests::tree;

    fn subtitle(index: i64, codec: &str, is_text: bool) -> SubtitleTrack {
        SubtitleTrack {
            index,
            language: None,
            title: None,
            codec: codec.into(),
            is_default: false,
            is_forced: false,
            is_text,
        }
    }

    /// Three subtitle tracks: SubRip and ASS (text) and PGS (images). Records the extractions it is asked for.
    #[derive(Default)]
    struct FakeToolkit {
        extracted: Mutex<Vec<(i64, SubtitleFormat)>>,
    }

    impl TrackToolkit for FakeToolkit {
        async fn tracks(&self, _video: &Path) -> AppResult<MediaTracks> {
            Ok(MediaTracks {
                audio: Vec::new(),
                subtitles: vec![
                    subtitle(0, "subrip", true),
                    subtitle(1, "hdmv_pgs_subtitle", false),
                    subtitle(2, "ass", true),
                ],
            })
        }

        async fn extract_subtitle(&self, _video: &Path, index: i64, format: SubtitleFormat) -> AppResult<String> {
            self.extracted.lock().unwrap().push((index, format));
            Ok(String::new())
        }
    }

    async fn library() -> (Db, tempfile::TempDir, String) {
        let dir = tree(&["Show/Ep 1.mkv"]);
        let db = Db::open_in_memory().unwrap();
        add_folder(&db, dir.path().join("Show").to_string_lossy().into_owned())
            .await
            .unwrap();
        let video = dir.path().join("Show").join("Ep 1.mkv").to_string_lossy().into_owned();
        (db, dir, video)
    }

    #[tokio::test]
    async fn extracts_ass_as_ass_and_other_text_subtitles_as_webvtt() {
        let (db, _dir, video) = library().await;
        let toolkit = FakeToolkit::default();
        let srt = extract_subtitle(&db, &toolkit, video.clone(), 0).await.unwrap();
        let ass = extract_subtitle(&db, &toolkit, video, 2).await.unwrap();
        assert_eq!((srt.format, ass.format), (SubtitleFormat::Vtt, SubtitleFormat::Ass));
        assert_eq!(
            *toolkit.extracted.lock().unwrap(),
            [(0, SubtitleFormat::Vtt), (2, SubtitleFormat::Ass)]
        );
    }

    #[tokio::test]
    async fn refuses_image_subtitles_and_missing_tracks_without_running_ffmpeg() {
        let (db, _dir, video) = library().await;
        let toolkit = FakeToolkit::default();
        for index in [1, 3, -1] {
            let result = extract_subtitle(&db, &toolkit, video.clone(), index).await;
            assert!(matches!(result, Err(AppError::InvalidInput(_))), "{index}");
        }
        assert!(toolkit.extracted.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn only_reads_files_inside_the_library() {
        let (db, _dir, _video) = library().await;
        let elsewhere = tree(&["other.mkv"]);
        let outside = elsewhere.path().join("other.mkv").to_string_lossy().into_owned();
        let toolkit = FakeToolkit::default();
        assert!(matches!(
            list_tracks(&db, &toolkit, outside.clone()).await,
            Err(AppError::InvalidInput(_))
        ));
        assert!(matches!(
            extract_subtitle(&db, &toolkit, outside, 0).await,
            Err(AppError::InvalidInput(_))
        ));
    }
}
