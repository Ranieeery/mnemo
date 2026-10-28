//! Playable copies (`domain::playable_copy`): MP4 copies, made without re-encoding, of videos whose container the
//! built-in player cannot open. Each copy is named after the original's path, size and modification time, so a
//! changed file gets a new copy and the old one ages out. A copy's modification time records when it was last
//! played, which the cleanup uses (file access times are not kept up to date on Windows).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

use tokio_util::sync::CancellationToken;
use xxhash_rust::xxh3::xxh3_64;

use super::{CopyToolkit, REMUX_TIMEOUT};
use crate::db::{Db, settings};
use crate::domain::playable_copy::{
    ClearedPlayableCopies, ContainerStreams, CopyFile, PlayableCopiesUsage, PlayableCopyCheck, PlayableCopySettings,
    check_copyable, copies_to_remove, limit_bytes,
};
use crate::error::{AppError, AppResult};
use crate::services::library::library_file;

const COPY_EXTENSION: &str = "mp4";
/// A copy being written. Leftovers of a crash are deleted once they are older than any remux can run.
const PARTIAL_EXTENSION: &str = "part";

/// The copy being made: the player plays one video at a time, so a new request cancels the previous one.
struct Running {
    id: u64,
    cancel: CancellationToken,
}

pub struct PlayableCopies<T> {
    db: Db,
    toolkit: Arc<T>,
    dir: PathBuf,
    running: Arc<Mutex<Option<Running>>>,
    next_id: Arc<AtomicU64>,
}

impl<T> Clone for PlayableCopies<T> {
    fn clone(&self) -> Self {
        Self {
            db: self.db.clone(),
            toolkit: Arc::clone(&self.toolkit),
            dir: self.dir.clone(),
            running: Arc::clone(&self.running),
            next_id: Arc::clone(&self.next_id),
        }
    }
}

/// A library video and where its copy goes.
struct Original {
    file: PathBuf,
    size: u64,
    copy: PathBuf,
}

impl<T: CopyToolkit> PlayableCopies<T> {
    pub fn new(db: Db, toolkit: T, dir: PathBuf) -> Self {
        Self {
            db,
            toolkit: Arc::new(toolkit),
            dir,
            running: Arc::default(),
            next_id: Arc::default(),
        }
    }

    pub async fn settings(&self) -> AppResult<PlayableCopySettings> {
        self.db
            .call(|connection| settings::get::<settings::PlayableCopies>(connection))
            .await
    }

    /// Stores the settings, then deletes the copies a lower limit no longer has room for.
    pub async fn update_settings(&self, new: PlayableCopySettings) -> AppResult<PlayableCopySettings> {
        let saved = self
            .db
            .call(move |connection| settings::set::<settings::PlayableCopies>(connection, new))
            .await?;
        self.clean_up(None).await;
        Ok(saved)
    }

    /// Whether the library video at `path` can get a playable copy; the error says why not.
    pub async fn check(&self, path: String) -> AppResult<PlayableCopyCheck> {
        let original = self.original(path).await?;
        let ready = exists(&original.copy).await?;
        let streams = if ready {
            // Already made: the limit or a codec check no longer matter.
            self.toolkit.container_streams(&original.file).await?
        } else {
            self.copyable(&original).await?
        };
        Ok(PlayableCopyCheck {
            container: streams.container,
            size_bytes: original.size as i64,
            ready,
        })
    }

    /// Returns the path of the video's playable copy, making it first if needed. Cancelled by [`Self::cancel`] or by
    /// the next call.
    pub async fn make(&self, path: String) -> AppResult<String> {
        let original = self.original(path).await?;
        if exists(&original.copy).await? {
            mark_used(original.copy.clone()).await;
            return Ok(original.copy.to_string_lossy().into_owned());
        }
        let streams = self.copyable(&original).await?;
        let video_codec = streams.video.map(|codec| codec.name).unwrap_or_default();

        let (id, cancel) = self.start_running();
        // Named after the run, so a cancelled run never deletes the file of the one that replaced it.
        let partial = original.copy.with_extension(format!("{id}.{PARTIAL_EXTENSION}"));
        let made = self
            .toolkit
            .remux(&original.file, &partial, &video_codec, &cancel)
            .await;
        self.finish_running(id);
        if let Err(error) = made {
            remove_logged(&partial).await;
            return Err(explain_remux_failure(error, &self.dir));
        }
        if let Err(error) = tokio::fs::rename(&partial, &original.copy).await {
            remove_logged(&partial).await;
            return Err(AppError::io(&original.copy, error));
        }
        self.clean_up(Some(&original.copy)).await;
        Ok(original.copy.to_string_lossy().into_owned())
    }

    /// Stops the copy being made, if any; its partial file is deleted.
    pub fn cancel(&self) {
        if let Some(running) = self.running_slot().take() {
            running.cancel.cancel();
        }
    }

    pub async fn usage(&self) -> AppResult<PlayableCopiesUsage> {
        let limit = limit_bytes(self.settings().await?.limit_gb);
        let (copies, _) = self.list().await?;
        Ok(PlayableCopiesUsage {
            used_bytes: copies.iter().map(|copy| copy.size).sum::<u64>() as i64,
            limit_bytes: limit as i64,
            count: copies.len() as i64,
        })
    }

    /// Deletes every copy. One open in the player cannot be deleted on Windows: it is kept and counted.
    pub async fn clear(&self) -> AppResult<ClearedPlayableCopies> {
        let (copies, _) = self.list().await?;
        let mut cleared = ClearedPlayableCopies {
            freed_bytes: 0,
            kept: 0,
        };
        for copy in copies {
            match tokio::fs::remove_file(&copy.path).await {
                Ok(()) => cleared.freed_bytes += copy.size as i64,
                Err(error) => {
                    tracing::warn!(path = %copy.path.display(), %error, "could not delete a playable copy");
                    cleared.kept += 1;
                }
            }
        }
        Ok(cleared)
    }

    /// Deletes copies unused for 30 days, then the least recently used ones over the limit, and partial files left
    /// by a crash. Never `keep`. Runs in the background: failures are logged.
    pub async fn clean_up(&self, keep: Option<&Path>) {
        if let Err(error) = self.try_clean_up(keep).await {
            tracing::warn!(%error, "could not clean up the playable copies");
        }
    }

    async fn try_clean_up(&self, keep: Option<&Path>) -> AppResult<()> {
        let limit = limit_bytes(self.settings().await?.limit_gb);
        let (copies, stale_partials) = self.list().await?;
        for path in copies_to_remove(copies, limit, SystemTime::now(), keep)
            .iter()
            .chain(&stale_partials)
        {
            remove_logged(path).await;
        }
        Ok(())
    }

    async fn original(&self, path: String) -> AppResult<Original> {
        let file = library_file(&self.db, path).await?;
        let metadata = tokio::fs::metadata(&file)
            .await
            .map_err(|error| AppError::io(&file, error))?;
        let copy = self.dir.join(copy_name(&file, &metadata));
        Ok(Original {
            size: metadata.len(),
            file,
            copy,
        })
    }

    async fn copyable(&self, original: &Original) -> AppResult<ContainerStreams> {
        let streams = self.toolkit.container_streams(&original.file).await?;
        check_copyable(&streams, original.size, self.settings().await?.limit_gb)?;
        Ok(streams)
    }

    /// The finished copies, and the partial files no remux can still be writing.
    async fn list(&self) -> AppResult<(Vec<CopyFile>, Vec<PathBuf>)> {
        let dir = self.dir.clone();
        tokio::task::spawn_blocking(move || list_copies(&dir)).await?
    }

    fn running_slot(&self) -> std::sync::MutexGuard<'_, Option<Running>> {
        self.running.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn start_running(&self) -> (u64, CancellationToken) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let cancel = CancellationToken::new();
        let previous = self.running_slot().replace(Running {
            id,
            cancel: cancel.clone(),
        });
        if let Some(previous) = previous {
            previous.cancel.cancel();
        }
        (id, cancel)
    }

    fn finish_running(&self, id: u64) {
        let mut running = self.running_slot();
        if running.as_ref().is_some_and(|running| running.id == id) {
            *running = None;
        }
    }
}

fn copy_name(file: &Path, metadata: &std::fs::Metadata) -> String {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |since| since.as_nanos());
    let identity = format!("{}\n{}\n{modified}", file.to_string_lossy(), metadata.len());
    format!("{:016x}.{COPY_EXTENSION}", xxh3_64(identity.as_bytes()))
}

fn has_extension(path: &Path, extension: &str) -> bool {
    path.extension()
        .is_some_and(|found| found.eq_ignore_ascii_case(extension))
}

fn list_copies(dir: &Path) -> AppResult<(Vec<CopyFile>, Vec<PathBuf>)> {
    let entries = std::fs::read_dir(dir).map_err(|error| AppError::io(dir, error))?;
    let now = SystemTime::now();
    let mut copies = Vec::new();
    let mut stale_partials = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| AppError::io(dir, error))?;
        let path = entry.path();
        let metadata = entry.metadata().map_err(|error| AppError::io(&path, error))?;
        if !metadata.is_file() {
            continue;
        }
        let modified = metadata.modified().map_err(|error| AppError::io(&path, error))?;
        if has_extension(&path, COPY_EXTENSION) {
            copies.push(CopyFile {
                path,
                size: metadata.len(),
                last_used: modified,
            });
        } else if has_extension(&path, PARTIAL_EXTENSION)
            && now.duration_since(modified).is_ok_and(|age| age > REMUX_TIMEOUT)
        {
            stale_partials.push(path);
        }
    }
    Ok((copies, stale_partials))
}

async fn exists(path: &Path) -> AppResult<bool> {
    tokio::fs::try_exists(path)
        .await
        .map_err(|error| AppError::io(path, error))
}

/// Records that a copy was played, for the cleanup. A failure only makes it look older, so it is logged.
async fn mark_used(copy: PathBuf) {
    let marked = tokio::task::spawn_blocking(move || {
        std::fs::File::options()
            .write(true)
            .open(&copy)?
            .set_modified(SystemTime::now())
    })
    .await;
    match marked {
        Ok(Ok(())) => {}
        Ok(Err(error)) => tracing::warn!(%error, "could not record that a playable copy was played"),
        Err(error) => tracing::warn!(%error, "could not record that a playable copy was played"),
    }
}

async fn remove_logged(path: &Path) {
    match tokio::fs::remove_file(path).await {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => tracing::warn!(path = %path.display(), %error, "could not delete a playable copy"),
    }
}

/// ffmpeg reports a full disk in its own words; say it plainly.
fn explain_remux_failure(error: AppError, dir: &Path) -> AppError {
    match error {
        AppError::MediaProcessFailed { message, .. } if message.contains("No space left on device") => AppError::Io {
            path: dir.to_string_lossy().into_owned(),
            message: "not enough free disk space for the playable copy".into(),
        },
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::domain::playable_copy::{BYTES_PER_GB, Codec, PlayableCopyMode};
    use crate::services::library::add_folder;
    use crate::services::scanner::tests::tree;

    /// Reports `codec` video in an MPEG-TS and "remuxes" by writing `copy_size` bytes. With `hold`, waits for the
    /// cancellation after starting to write; with `failure`, fails with that ffmpeg message.
    struct FakeToolkit {
        codec: &'static str,
        copy_size: usize,
        hold: bool,
        failure: Option<&'static str>,
        remuxed: Mutex<Vec<PathBuf>>,
    }

    impl FakeToolkit {
        fn new(codec: &'static str) -> Self {
            Self {
                codec,
                copy_size: 10,
                hold: false,
                failure: None,
                remuxed: Mutex::default(),
            }
        }
    }

    impl CopyToolkit for FakeToolkit {
        async fn container_streams(&self, _video: &Path) -> AppResult<ContainerStreams> {
            Ok(ContainerStreams {
                container: "MPEG-TS (MPEG-2 Transport Stream)".into(),
                video: Some(Codec {
                    name: self.codec.into(),
                    long_name: format!("{} long name", self.codec),
                }),
            })
        }

        async fn remux(&self, video: &Path, output: &Path, _codec: &str, cancel: &CancellationToken) -> AppResult<()> {
            self.remuxed.lock().unwrap().push(video.to_path_buf());
            std::fs::write(output, vec![0; self.copy_size]).unwrap();
            if self.hold {
                cancel.cancelled().await;
                return Err(AppError::Cancelled);
            }
            match self.failure {
                Some(message) => Err(AppError::MediaProcessFailed {
                    tool: "ffmpeg".into(),
                    message: message.into(),
                }),
                None => Ok(()),
            }
        }
    }

    struct Setup {
        copies: PlayableCopies<FakeToolkit>,
        video: String,
        dir: PathBuf,
        _library: tempfile::TempDir,
        _copies: tempfile::TempDir,
    }

    async fn setup(toolkit: FakeToolkit) -> Setup {
        let library = tree(&["Course/01. Welcome.mp4"]);
        let db = Db::open_in_memory().unwrap();
        add_folder(&db, library.path().join("Course").to_string_lossy().into_owned())
            .await
            .unwrap();
        let video = library.path().join("Course").join("01. Welcome.mp4");
        std::fs::write(&video, b"transport stream").unwrap();
        let copies_dir = tempfile::tempdir().unwrap();
        Setup {
            copies: PlayableCopies::new(db, toolkit, copies_dir.path().to_path_buf()),
            video: video.to_string_lossy().into_owned(),
            dir: copies_dir.path().to_path_buf(),
            _library: library,
            _copies: copies_dir,
        }
    }

    fn files_in(dir: &Path) -> Vec<PathBuf> {
        std::fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect()
    }

    #[tokio::test]
    async fn makes_a_copy_once_and_reuses_it() {
        let setup = setup(FakeToolkit::new("h264")).await;
        let check = setup.copies.check(setup.video.clone()).await.unwrap();
        assert_eq!(check.container, "MPEG-TS (MPEG-2 Transport Stream)");
        assert!(!check.ready);

        let copy = setup.copies.make(setup.video.clone()).await.unwrap();
        assert!(
            copy.ends_with(".mp4") && Path::new(&copy).starts_with(&setup.dir),
            "{copy}"
        );
        assert_eq!(setup.copies.make(setup.video.clone()).await.unwrap(), copy);
        assert_eq!(setup.copies.toolkit.remuxed.lock().unwrap().len(), 1);
        assert!(setup.copies.check(setup.video.clone()).await.unwrap().ready);
        assert_eq!(files_in(&setup.dir), [PathBuf::from(&copy)]);
    }

    #[tokio::test]
    async fn a_changed_original_gets_a_new_copy() {
        let setup = setup(FakeToolkit::new("h264")).await;
        let first = setup.copies.make(setup.video.clone()).await.unwrap();
        std::fs::write(&setup.video, b"a longer transport stream").unwrap();
        let second = setup.copies.make(setup.video.clone()).await.unwrap();
        assert_ne!(first, second);
    }

    #[tokio::test]
    async fn refuses_codecs_the_player_cannot_decode_without_running_ffmpeg() {
        let setup = setup(FakeToolkit::new("mpeg4")).await;
        let error = setup.copies.check(setup.video.clone()).await.unwrap_err();
        assert!(error.to_string().contains("mpeg4 long name"), "{error}");
        assert!(setup.copies.make(setup.video.clone()).await.is_err());
        assert!(setup.copies.toolkit.remuxed.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn only_copies_files_inside_the_library() {
        let setup = setup(FakeToolkit::new("h264")).await;
        let elsewhere = tree(&["other.mp4"]);
        let outside = elsewhere.path().join("other.mp4").to_string_lossy().into_owned();
        assert!(matches!(
            setup.copies.make(outside).await,
            Err(AppError::InvalidInput(_))
        ));
    }

    #[tokio::test]
    async fn cancelling_stops_the_copy_and_deletes_the_partial_file() {
        let setup = setup(FakeToolkit {
            hold: true,
            ..FakeToolkit::new("h264")
        })
        .await;
        let copies = setup.copies.clone();
        let video = setup.video.clone();
        let making = tokio::spawn(async move { copies.make(video).await });
        while files_in(&setup.dir).is_empty() {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        setup.copies.cancel();
        assert!(matches!(making.await.unwrap(), Err(AppError::Cancelled)));
        assert!(files_in(&setup.dir).is_empty());
    }

    #[tokio::test]
    async fn explains_a_full_disk() {
        let setup = setup(FakeToolkit {
            failure: Some("Error writing trailer: No space left on device"),
            ..FakeToolkit::new("h264")
        })
        .await;
        let error = setup.copies.make(setup.video.clone()).await.unwrap_err();
        assert!(error.to_string().contains("not enough free disk space"), "{error}");
        assert!(files_in(&setup.dir).is_empty());
    }

    #[tokio::test]
    async fn keeps_the_new_copy_and_drops_older_ones_over_the_limit() {
        let setup = setup(FakeToolkit::new("h264")).await;
        let settings = PlayableCopySettings {
            mode: PlayableCopyMode::Always,
            limit_gb: 1,
        };
        setup.copies.update_settings(settings).await.unwrap();
        let old = setup.dir.join("0000000000000001.mp4");
        std::fs::File::create(&old).unwrap().set_len(BYTES_PER_GB).unwrap();
        let copy = setup.copies.make(setup.video.clone()).await.unwrap();
        assert_eq!(files_in(&setup.dir), [PathBuf::from(copy)]);
    }

    #[tokio::test]
    async fn cleans_up_copies_unused_for_thirty_days_and_stale_partial_files() {
        let setup = setup(FakeToolkit::new("h264")).await;
        let long_ago = SystemTime::now() - Duration::from_secs(31 * 24 * 60 * 60);
        for name in ["old.mp4", "crashed.7.part"] {
            let file = std::fs::File::create(setup.dir.join(name)).unwrap();
            file.set_modified(long_ago).unwrap();
        }
        std::fs::write(setup.dir.join("recent.mp4"), b"copy").unwrap();
        std::fs::write(setup.dir.join("writing.8.part"), b"copy").unwrap();
        setup.copies.clean_up(None).await;
        let mut left: Vec<_> = files_in(&setup.dir)
            .iter()
            .map(|path| path.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        left.sort();
        assert_eq!(left, ["recent.mp4", "writing.8.part"]);
    }

    #[tokio::test]
    async fn reports_usage_and_clears_every_copy() {
        let setup = setup(FakeToolkit::new("h264")).await;
        setup.copies.make(setup.video.clone()).await.unwrap();
        assert_eq!(
            setup.copies.usage().await.unwrap(),
            PlayableCopiesUsage {
                used_bytes: 10,
                limit_bytes: 5 * BYTES_PER_GB as i64,
                count: 1
            }
        );
        assert_eq!(
            setup.copies.clear().await.unwrap(),
            ClearedPlayableCopies {
                freed_bytes: 10,
                kept: 0
            }
        );
        assert_eq!(setup.copies.usage().await.unwrap().count, 0);
    }
}
