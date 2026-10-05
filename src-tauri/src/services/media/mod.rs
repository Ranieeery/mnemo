//! Media metadata and thumbnails through the external `ffprobe`/`ffmpeg` tools, and the processing pipeline.

mod ffprobe;
pub mod pipeline;
mod process;
pub mod thumbnails;

use std::ffi::OsStr;
use std::future::Future;
use std::path::Path;
use std::time::Duration;

use crate::domain::models::MediaToolsStatus;
use crate::error::AppResult;

const PROBE_TIMEOUT: Duration = Duration::from_secs(30);
const THUMBNAIL_TIMEOUT: Duration = Duration::from_secs(60);
const VERSION_TIMEOUT: Duration = Duration::from_secs(10);

/// Operations the pipeline needs from the media tools. Abstracted so the pipeline can be tested without ffmpeg.
pub trait MediaToolkit: Send + Sync {
    /// Duration in seconds of a file that has a video stream.
    fn probe(&self, video: &Path) -> impl Future<Output = AppResult<f64>> + Send;
    /// Writes a JPEG frame of `video` taken at `at_seconds` to `output`.
    fn thumbnail(&self, video: &Path, output: &Path, at_seconds: f64) -> impl Future<Output = AppResult<()>> + Send;
}

/// The real toolkit: `ffprobe` and `ffmpeg` found on the `PATH`.
pub struct Ffmpeg;

impl MediaToolkit for Ffmpeg {
    async fn probe(&self, video: &Path) -> AppResult<f64> {
        let output = process::run(
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
        )
        .await?;
        ffprobe::parse_duration(&output)
    }

    async fn thumbnail(&self, video: &Path, output: &Path, at_seconds: f64) -> AppResult<()> {
        let timestamp = format!("{at_seconds:.3}");
        // `-ss` before `-i` seeks in the input, which is much faster than decoding up to the timestamp.
        process::run(
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
        )
        .await
        .map(drop)
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

        let duration = Ffmpeg.probe(&video).await.unwrap();
        assert!((duration - 3.0).abs() < 0.2, "{duration}");

        let thumbnail = dir.path().join("sample.jpg");
        Ffmpeg
            .thumbnail(&video, &thumbnail, thumbnails::capture_time(duration))
            .await
            .unwrap();
        assert!(std::fs::metadata(&thumbnail).unwrap().len() > 0);
    }
}
