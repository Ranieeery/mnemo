use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Frame used for the thumbnail: 10 s in, or a quarter of the way through short videos.
pub fn capture_time(duration_seconds: f64) -> f64 {
    (duration_seconds / 4.0).clamp(0.0, 10.0)
}

/// Thumbnail file for a video, named like the legacy app did: `<file name>_<unix millis>.jpg`.
pub fn file_for(thumbnails_dir: &Path, video: &Path) -> PathBuf {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or_default();
    let name = video
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "video".to_owned());
    thumbnails_dir.join(format!("{name}_{millis}.jpg"))
}

/// Deletes thumbnail files of removed videos. Only files inside `thumbnails_dir` are touched, and failures are logged
/// rather than reported: a leftover image must not undo a successful removal.
pub fn delete(thumbnails_dir: &Path, thumbnails: &[String]) {
    for thumbnail in thumbnails {
        let path = Path::new(thumbnail);
        if !path.starts_with(thumbnails_dir) {
            tracing::warn!(path = %thumbnail, "not deleting a thumbnail outside the thumbnails directory");
            continue;
        }
        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => tracing::warn!(path = %thumbnail, %error, "failed to delete thumbnail"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_time_is_capped_for_long_videos() {
        assert_eq!(capture_time(3600.0), 10.0);
        assert_eq!(capture_time(20.0), 5.0);
        assert_eq!(capture_time(0.0), 0.0);
    }

    #[test]
    fn file_name_keeps_the_video_name() {
        let file = file_for(Path::new("thumbs"), Path::new("videos/Ep 1.mkv"));
        assert!(file.starts_with("thumbs"));
        let name = file.file_name().unwrap().to_string_lossy();
        assert!(name.starts_with("Ep 1.mkv_") && name.ends_with(".jpg"), "{name}");
    }

    #[test]
    fn deletes_only_files_inside_the_thumbnails_dir() {
        let thumbnails_dir = tempfile::tempdir().unwrap();
        let outside_dir = tempfile::tempdir().unwrap();
        let inside = thumbnails_dir.path().join("a.jpg");
        let outside = outside_dir.path().join("b.jpg");
        std::fs::write(&inside, b"").unwrap();
        std::fs::write(&outside, b"").unwrap();

        let paths = [&inside, &outside, &thumbnails_dir.path().join("missing.jpg")]
            .map(|path| path.to_string_lossy().into_owned());
        delete(thumbnails_dir.path(), &paths);

        assert!(!inside.exists());
        assert!(outside.exists());
    }
}
