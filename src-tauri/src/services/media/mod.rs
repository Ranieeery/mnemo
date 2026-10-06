//! Media metadata and thumbnails through the external `ffprobe`/`ffmpeg` tools, and the processing pipeline.

pub mod cover;
mod ffprobe;
mod process;
pub mod processing;
pub mod thumbnails;
pub mod tracks;

use std::ffi::OsStr;
use std::future::Future;
use std::path::Path;
use std::time::Duration;

use crate::domain::models::{MediaToolsStatus, MediaTracks, SubtitleFormat};
use crate::error::AppResult;
use tokio_util::sync::CancellationToken;

const PROBE_TIMEOUT: Duration = Duration::from_secs(30);
const THUMBNAIL_TIMEOUT: Duration = Duration::from_secs(60);
const VERSION_TIMEOUT: Duration = Duration::from_secs(10);
const SUBTITLE_TIMEOUT: Duration = Duration::from_secs(120);

/// Operations the pipeline needs from the media tools. Abstracted so the pipeline can be tested without ffmpeg.
/// `cancel` stops the work early with [`AppError::Cancelled`](crate::error::AppError::Cancelled), killing the tool.
pub trait MediaToolkit: Send + Sync {
    /// Duration in seconds of a file that has a video stream.
    fn probe(&self, video: &Path, cancel: &CancellationToken) -> impl Future<Output = AppResult<f64>> + Send;
    /// Writes a JPEG frame of `video` taken at `at_seconds` to `output`.
    fn thumbnail(
        &self,
        video: &Path,
        output: &Path,
        at_seconds: f64,
        cancel: &CancellationToken,
    ) -> impl Future<Output = AppResult<()>> + Send;
}

/// The real toolkit: `ffprobe` and `ffmpeg` found on the `PATH`.
pub struct Ffmpeg;

impl MediaToolkit for Ffmpeg {
    async fn probe(&self, video: &Path, cancel: &CancellationToken) -> AppResult<f64> {
        let output = process::run_until_cancelled(
            "ffprobe",
            [
                OsStr::new("-v"),
                OsStr::new("quiet"),
                OsStr::new("-print_format"),
                OsStr::new("json"),
                OsStr::new("-show_format"),
                OsStr::new("-show_streams"),
                video.as_os_str(),
            ],
            PROBE_TIMEOUT,
            cancel,
        )
        .await?;
        ffprobe::parse_duration(&output)
    }

    async fn thumbnail(
        &self,
        video: &Path,
        output: &Path,
        at_seconds: f64,
        cancel: &CancellationToken,
    ) -> AppResult<()> {
        let timestamp = format!("{at_seconds:.3}");
        // `-ss` before `-i` seeks in the input, which is much faster than decoding up to the timestamp.
        process::run_until_cancelled(
            "ffmpeg",
            [
                OsStr::new("-ss"),
                OsStr::new(&timestamp),
                OsStr::new("-i"),
                video.as_os_str(),
                OsStr::new("-frames:v"),
                OsStr::new("1"),
                OsStr::new("-vf"),
                OsStr::new("scale=320:240:force_original_aspect_ratio=decrease,pad=320:240:(ow-iw)/2:(oh-ih)/2"),
                OsStr::new("-y"),
                output.as_os_str(),
            ],
            THUMBNAIL_TIMEOUT,
            cancel,
        )
        .await
        .map(drop)
    }
}

/// Operations on the streams inside a video. Separate from [`MediaToolkit`] because the processing pipeline does not
/// need them; abstracted so they can be tested without ffmpeg.
pub trait TrackToolkit: Send + Sync {
    /// Audio and subtitle streams of `video`.
    fn tracks(&self, video: &Path) -> impl Future<Output = AppResult<MediaTracks>> + Send;
    /// The subtitle stream `index` (among the subtitle streams), converted to `format` (WebVTT or ASS).
    fn extract_subtitle(
        &self,
        video: &Path,
        index: i64,
        format: SubtitleFormat,
    ) -> impl Future<Output = AppResult<String>> + Send;
}

impl TrackToolkit for Ffmpeg {
    async fn tracks(&self, video: &Path) -> AppResult<MediaTracks> {
        let output = process::run(
            "ffprobe",
            [
                OsStr::new("-v"),
                OsStr::new("quiet"),
                OsStr::new("-print_format"),
                OsStr::new("json"),
                OsStr::new("-show_streams"),
                video.as_os_str(),
            ],
            PROBE_TIMEOUT,
        )
        .await?;
        ffprobe::parse_tracks(&output)
    }

    async fn extract_subtitle(&self, video: &Path, index: i64, format: SubtitleFormat) -> AppResult<String> {
        let stream = format!("0:s:{index}");
        let muxer = match format {
            SubtitleFormat::Ass => "ass",
            SubtitleFormat::Srt => "srt",
            SubtitleFormat::Vtt | SubtitleFormat::Sub => "webvtt",
        };
        // Subtitles are spread through the whole file, so this reads all of it.
        let output = process::run(
            "ffmpeg",
            [
                OsStr::new("-v"),
                OsStr::new("error"),
                OsStr::new("-i"),
                video.as_os_str(),
                OsStr::new("-map"),
                OsStr::new(&stream),
                OsStr::new("-f"),
                OsStr::new(muxer),
                OsStr::new("pipe:1"),
            ],
            SUBTITLE_TIMEOUT,
        )
        .await?;
        Ok(String::from_utf8_lossy(&output).into_owned())
    }
}

/// Checks whether `ffmpeg` and `ffprobe` can be executed.
pub async fn tools_status() -> MediaToolsStatus {
    let (ffmpeg, ffprobe) = tokio::join!(
        process::run("ffmpeg", ["-version"], VERSION_TIMEOUT),
        process::run("ffprobe", ["-version"], VERSION_TIMEOUT),
    );
    MediaToolsStatus {
        ffmpeg: ffmpeg.is_ok(),
        ffprobe: ffprobe.is_ok(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Exercises the real tools end to end. Requires `ffmpeg` and `ffprobe` on the PATH:
    /// `cargo test -- --ignored real_ffmpeg`
    #[tokio::test]
    #[ignore = "needs ffmpeg and ffprobe on the PATH"]
    async fn real_ffmpeg_probes_and_extracts_a_thumbnail() {
        assert_eq!(
            tools_status().await,
            MediaToolsStatus {
                ffmpeg: true,
                ffprobe: true
            }
        );

        let dir = tempfile::tempdir().unwrap();
        let video = dir.path().join("sample.mp4");
        process::run(
            "ffmpeg",
            [
                OsStr::new("-f"),
                OsStr::new("lavfi"),
                OsStr::new("-i"),
                OsStr::new("testsrc=duration=3:size=320x240:rate=10"),
                OsStr::new("-y"),
                video.as_os_str(),
            ],
            THUMBNAIL_TIMEOUT,
        )
        .await
        .unwrap();

        let duration = Ffmpeg.probe(&video, &CancellationToken::new()).await.unwrap();
        assert!((duration - 3.0).abs() < 0.2, "{duration}");

        let thumbnail = dir.path().join("sample.jpg");
        Ffmpeg
            .thumbnail(
                &video,
                &thumbnail,
                thumbnails::capture_time(duration),
                &CancellationToken::new(),
            )
            .await
            .unwrap();
        assert!(std::fs::metadata(&thumbnail).unwrap().len() > 0);
    }

    /// `cargo test -- --ignored real_ffmpeg`
    #[tokio::test]
    #[ignore = "needs ffmpeg and ffprobe on the PATH"]
    async fn real_ffmpeg_lists_tracks_and_extracts_an_embedded_subtitle() {
        let dir = tempfile::tempdir().unwrap();
        let srt = dir.path().join("subs.srt");
        std::fs::write(&srt, "1\n00:00:00,500 --> 00:00:02,000\nHello there\n").unwrap();
        let video = dir.path().join("sample.mkv");
        process::run(
            "ffmpeg",
            [
                OsStr::new("-f"),
                OsStr::new("lavfi"),
                OsStr::new("-i"),
                OsStr::new("testsrc=duration=3:size=320x240:rate=10"),
                OsStr::new("-f"),
                OsStr::new("lavfi"),
                OsStr::new("-i"),
                OsStr::new("sine=duration=3"),
                OsStr::new("-i"),
                srt.as_os_str(),
                OsStr::new("-map"),
                OsStr::new("0"),
                OsStr::new("-map"),
                OsStr::new("1"),
                OsStr::new("-map"),
                OsStr::new("2"),
                OsStr::new("-metadata:s:s:0"),
                OsStr::new("language=eng"),
                OsStr::new("-y"),
                video.as_os_str(),
            ],
            THUMBNAIL_TIMEOUT,
        )
        .await
        .unwrap();

        let tracks = Ffmpeg.tracks(&video).await.unwrap();
        assert_eq!(tracks.audio.len(), 1);
        assert_eq!(tracks.subtitles.len(), 1);
        assert_eq!(tracks.subtitles[0].language.as_deref(), Some("eng"));
        assert!(tracks.subtitles[0].is_text);

        let vtt = Ffmpeg.extract_subtitle(&video, 0, SubtitleFormat::Vtt).await.unwrap();
        assert!(vtt.starts_with("WEBVTT"), "{vtt}");
        assert!(vtt.contains("Hello there"), "{vtt}");
    }
}
