//! Chosen thumbnails: a frame of the video, picked in the player, replaces its automatic thumbnail.

use std::path::Path;

use tokio_util::sync::CancellationToken;

use super::{MediaToolkit, thumbnails};
use crate::db::{Db, videos};
use crate::domain::models::Video;
use crate::error::{AppError, AppResult};

/// Replaces a video's thumbnail with its frame at `position_seconds`, or with the automatic frame when `None`.
///
/// The image goes to a new file (so the webview never shows a cached copy of the old one), the database points to it,
/// and only then is the old file deleted. If anything fails, the video keeps its current thumbnail.
pub async fn set_video_thumbnail<T: MediaToolkit>(
    db: &Db,
    toolkit: &T,
    thumbnails_dir: &Path,
    video_id: i64,
    position_seconds: Option<f64>,
) -> AppResult<Video> {
    if let Some(position) = position_seconds
        && (!position.is_finite() || position < 0.0)
    {
        return Err(AppError::InvalidInput(format!(
            "{position} is not a valid position in the video"
        )));
    }
    let video = db.call(move |connection| videos::get(connection, video_id)).await?;
    let at_seconds = match position_seconds {
        Some(position) if video.duration_seconds > 0.0 => position.min(video.duration_seconds),
        Some(position) => position,
        None => thumbnails::capture_time(video.duration_seconds),
    };

    let output = thumbnails::file_for(thumbnails_dir, Path::new(&video.file_path));
    let new_thumbnail = output.to_string_lossy().into_owned();
    if let Err(error) = toolkit
        .thumbnail(
            Path::new(&video.file_path),
            &output,
            at_seconds,
            &CancellationToken::new(),
        )
        .await
    {
        discard(thumbnails_dir, vec![new_thumbnail]).await;
        return Err(error);
    }

    let stored = new_thumbnail.clone();
    let updated = match db
        .call(move |connection| videos::set_thumbnail(connection, video_id, &stored))
        .await
    {
        Ok(updated) => updated,
        Err(error) => {
            discard(thumbnails_dir, vec![new_thumbnail]).await;
            return Err(error);
        }
    };
    if let Some(old) = video.thumbnail_path.filter(|old| *old != new_thumbnail) {
        discard(thumbnails_dir, vec![old]).await;
    }
    Ok(updated)
}

/// Deletes thumbnail files off the async runtime; `thumbnails::delete` only touches the thumbnails directory.
async fn discard(thumbnails_dir: &Path, files: Vec<String>) {
    let thumbnails_dir = thumbnails_dir.to_path_buf();
    if let Err(error) = tokio::task::spawn_blocking(move || thumbnails::delete(&thumbnails_dir, &files)).await {
        tracing::warn!(%error, "failed to delete thumbnails");
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Mutex;

    use super::*;
    use crate::db::videos::NewVideo;
    use crate::services::media::processing::Priority;
    use crate::services::media::processing::tests::{FakeToolkit as ProcessingToolkit, Harness};
    use crate::services::scanner::tests::tree;

    /// Writes a fake image and records the requested times; fails when asked to.
    #[derive(Default)]
    struct FakeToolkit {
        fail: bool,
        requested: Mutex<Vec<f64>>,
    }

    impl MediaToolkit for FakeToolkit {
        async fn probe(&self, _video: &Path, _cancel: &CancellationToken) -> AppResult<f64> {
            Ok(600.0)
        }

        async fn thumbnail(
            &self,
            _video: &Path,
            output: &Path,
            at_seconds: f64,
            _cancel: &CancellationToken,
        ) -> AppResult<()> {
            self.requested.lock().unwrap().push(at_seconds);
            // Like ffmpeg, a failure can leave a partial file behind.
            std::fs::write(output, b"jpg").unwrap();
            if self.fail {
                return Err(AppError::MediaProcessFailed {
                    tool: "ffmpeg".into(),
                    message: "no frame".into(),
                });
            }
            Ok(())
        }
    }

    struct Fixture {
        db: Db,
        thumbnails_dir: tempfile::TempDir,
        video: Video,
    }

    /// A 600 s video whose thumbnail file exists in the thumbnails directory.
    async fn fixture(thumbnail: Option<&str>) -> Fixture {
        let db = Db::open_in_memory().unwrap();
        let thumbnails_dir = tempfile::tempdir().unwrap();
        let thumbnail_path = thumbnail.map(|name| {
            let path = thumbnails_dir.path().join(name);
            std::fs::write(&path, b"old").unwrap();
            path.to_string_lossy().into_owned()
        });
        let video = db
            .call(move |connection| {
                videos::insert(
                    connection,
                    &NewVideo {
                        file_path: "D:\\Show\\Ep 1.mkv",
                        title: "Ep 1",
                        duration_seconds: 600.0,
                        thumbnail_path: thumbnail_path.as_deref(),
                    },
                )
            })
            .await
            .unwrap();
        Fixture {
            db,
            thumbnails_dir,
            video,
        }
    }

    fn files_in(dir: &Path) -> Vec<PathBuf> {
        std::fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect()
    }

    #[tokio::test]
    async fn replaces_the_thumbnail_with_the_chosen_frame() {
        let Fixture {
            db,
            thumbnails_dir,
            video,
        } = fixture(Some("old.jpg")).await;
        let toolkit = FakeToolkit::default();

        let updated = set_video_thumbnail(&db, &toolkit, thumbnails_dir.path(), video.id, Some(123.4))
            .await
            .unwrap();

        assert_eq!(*toolkit.requested.lock().unwrap(), [123.4]);
        let new_thumbnail = PathBuf::from(updated.thumbnail_path.unwrap());
        assert_eq!(files_in(thumbnails_dir.path()), std::slice::from_ref(&new_thumbnail));
        assert_ne!(new_thumbnail, thumbnails_dir.path().join("old.jpg"));
    }

    #[tokio::test]
    async fn uses_the_automatic_frame_or_clamps_to_the_duration() {
        let Fixture {
            db,
            thumbnails_dir,
            video,
        } = fixture(None).await;
        let toolkit = FakeToolkit::default();

        set_video_thumbnail(&db, &toolkit, thumbnails_dir.path(), video.id, None)
            .await
            .unwrap();
        set_video_thumbnail(&db, &toolkit, thumbnails_dir.path(), video.id, Some(9000.0))
            .await
            .unwrap();

        assert_eq!(
            *toolkit.requested.lock().unwrap(),
            [thumbnails::capture_time(600.0), 600.0]
        );
        // The first replacement was deleted by the second.
        assert_eq!(files_in(thumbnails_dir.path()).len(), 1);
    }

    #[tokio::test]
    async fn keeps_the_current_thumbnail_when_ffmpeg_fails() {
        let Fixture {
            db,
            thumbnails_dir,
            video,
        } = fixture(Some("old.jpg")).await;
        let toolkit = FakeToolkit {
            fail: true,
            ..FakeToolkit::default()
        };

        let result = set_video_thumbnail(&db, &toolkit, thumbnails_dir.path(), video.id, Some(30.0)).await;

        assert!(matches!(result, Err(AppError::MediaProcessFailed { .. })));
        assert_eq!(files_in(thumbnails_dir.path()), [thumbnails_dir.path().join("old.jpg")]);
        let stored = db
            .call(move |connection| videos::get(connection, video.id))
            .await
            .unwrap();
        assert_eq!(stored.thumbnail_path, video.thumbnail_path);
    }

    #[tokio::test]
    async fn rejects_invalid_positions_and_unknown_videos_before_running_ffmpeg() {
        let Fixture {
            db,
            thumbnails_dir,
            video,
        } = fixture(None).await;
        let toolkit = FakeToolkit::default();

        for position in [-1.0, f64::NAN, f64::INFINITY] {
            let result = set_video_thumbnail(&db, &toolkit, thumbnails_dir.path(), video.id, Some(position)).await;
            assert!(matches!(result, Err(AppError::InvalidInput(_))), "{position}");
        }
        let missing = set_video_thumbnail(&db, &toolkit, thumbnails_dir.path(), video.id + 1, Some(1.0)).await;
        assert!(matches!(missing, Err(AppError::NotFound(_))));
        assert!(toolkit.requested.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn never_deletes_an_old_thumbnail_outside_the_thumbnails_dir() {
        let Fixture {
            db,
            thumbnails_dir,
            video,
        } = fixture(None).await;
        let elsewhere = tempfile::tempdir().unwrap();
        let outside = elsewhere.path().join("cover.jpg");
        std::fs::write(&outside, b"old").unwrap();
        let outside_path = outside.to_string_lossy().into_owned();
        db.call(move |connection| videos::set_thumbnail(connection, video.id, &outside_path))
            .await
            .unwrap();

        set_video_thumbnail(&db, &FakeToolkit::default(), thumbnails_dir.path(), video.id, Some(5.0))
            .await
            .unwrap();
        assert!(outside.exists());
    }

    #[tokio::test]
    async fn processing_the_folder_again_keeps_the_chosen_thumbnail() {
        let library = tree(&["Ep 1.mkv"]);
        let harness = Harness::new(ProcessingToolkit::default(), 1);
        harness
            .processor
            .enqueue(library.path().to_path_buf(), Priority::Normal, false);
        harness.outcomes(1).await;
        let file = library.path().join("Ep 1.mkv").to_string_lossy().into_owned();
        let video = harness
            .db
            .call(move |connection| videos::find_by_path(connection, &file))
            .await
            .unwrap()
            .unwrap();

        let chosen = set_video_thumbnail(
            &harness.db,
            &FakeToolkit::default(),
            harness.thumbnails_dir.path(),
            video.id,
            Some(42.0),
        )
        .await
        .unwrap();
        harness
            .processor
            .enqueue(library.path().to_path_buf(), Priority::Normal, false);
        harness.outcomes(2).await;

        let stored = harness
            .db
            .call(move |connection| videos::get(connection, video.id))
            .await
            .unwrap();
        assert_eq!(stored.thumbnail_path, chosen.thumbnail_path);
    }
}
