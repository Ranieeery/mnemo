use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Frame used for the thumbnail: 10 s in, or a quarter of the way through short videos.
pub fn capture_time(duration_seconds: f64) -> f64 {
    (duration_seconds / 4.0).clamp(0.0, 10.0)
}

/// Thumbnail file for a video: `<file name>_<unix millis>_<sequence>.jpg`. The sequence keeps names apart when
/// parallel workers read same-named videos (from different folders) in the same millisecond.
pub fn file_for(thumbnails_dir: &Path, video: &Path) -> PathBuf {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or_default();
    let sequence = SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let name = video
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "video".to_owned());
    thumbnails_dir.join(format!("{name}_{millis}_{sequence}.jpg"))
}

/// Deletes files in `thumbnails_dir` that no video uses (`used` holds full paths) and that were last written more
/// than `older_than` ago, so thumbnails of videos still being read (stored a moment later) are left alone. Returns
/// how many were deleted.
pub fn delete_unused(thumbnails_dir: &Path, used: &HashSet<String>, older_than: Duration) -> usize {
    let Ok(entries) = std::fs::read_dir(thumbnails_dir) else {
        return 0;
    };
    let cutoff = SystemTime::now().checked_sub(older_than).unwrap_or(UNIX_EPOCH);
    let unused: Vec<String> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .filter(|entry| {
            entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .is_ok_and(|modified| modified < cutoff)
        })
        .map(|entry| entry.path().to_string_lossy().into_owned())
        .filter(|path| !used.contains(path))
        .collect();
    delete(thumbnails_dir, &unused);
    unused.len()
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
    fn same_named_videos_get_different_files() {
        let first = file_for(Path::new("thumbs"), Path::new("Show A/Ep 1.mkv"));
        let second = file_for(Path::new("thumbs"), Path::new("Show B/Ep 1.mkv"));
        assert_ne!(first, second);
    }

    #[test]
    fn file_name_keeps_the_video_name() {
        let file = file_for(Path::new("thumbs"), Path::new("videos/Ep 1.mkv"));
        assert!(file.starts_with("thumbs"));
        let name = file.file_name().unwrap().to_string_lossy();
        assert!(name.starts_with("Ep 1.mkv_") && name.ends_with(".jpg"), "{name}");
    }

    #[test]
    fn deletes_unused_thumbnails_older_than_the_grace_period() {
        let dir = tempfile::tempdir().unwrap();
        let used = dir.path().join("used.jpg");
        let unused = dir.path().join("unused.jpg");
        std::fs::write(&used, b"").unwrap();
        std::fs::write(&unused, b"").unwrap();
        let used_paths = HashSet::from([used.to_string_lossy().into_owned()]);

        // Just written: maybe a video being read right now, so kept.
        assert_eq!(delete_unused(dir.path(), &used_paths, Duration::from_secs(3600)), 0);
        assert!(unused.exists());

        assert_eq!(delete_unused(dir.path(), &used_paths, Duration::ZERO), 1);
        assert!(!unused.exists());
        assert!(used.exists());
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
