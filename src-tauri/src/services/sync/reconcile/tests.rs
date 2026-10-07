use super::*;
use crate::db::videos::{self, NewVideo};
use crate::db::{tags, watch};
use crate::domain::models::Video;

fn known(id: i64, path: &str, size: Option<i64>, fingerprint: Option<&str>, missing: bool) -> KnownFile {
    KnownFile {
        id,
        path: path.to_owned(),
        size,
        fingerprint: fingerprint.map(str::to_owned),
        missing,
    }
}

fn disk(files: &[(&str, i64)]) -> DiskScan {
    DiskScan {
        files: files
            .iter()
            .map(|(path, size)| DiskFile {
                path: (*path).to_owned(),
                size: *size,
            })
            .collect(),
        unreadable: Vec::new(),
    }
}

fn identities(entries: &[(&str, i64, &str)]) -> HashMap<String, FileIdentity> {
    entries
        .iter()
        .map(|(path, size, fingerprint)| {
            (
                (*path).to_owned(),
                FileIdentity {
                    size: *size,
                    fingerprint: (*fingerprint).to_owned(),
                },
            )
        })
        .collect()
}

#[test]
fn a_renamed_file_keeps_its_video_and_the_rest_is_new() {
    let stored = [known(1, "/lib/Ep 1.mkv", Some(10), Some("aa"), false)];
    let scan = disk(&[("/lib/Pilot.mkv", 10), ("/lib/Ep 2.mkv", 20)]);
    assert_eq!(to_identify(&stored, &[], &scan), vec!["/lib/Pilot.mkv"]);

    let plan = plan(&stored, &[], &scan, &identities(&[("/lib/Pilot.mkv", 10, "aa")]));
    assert_eq!(plan.relocate.len(), 1);
    assert_eq!(plan.relocate[0].0, 1);
    assert_eq!(plan.relocate[0].1, "/lib/Pilot.mkv");
    assert!(plan.mark_missing.is_empty());
    assert_eq!(plan.new_files, vec!["/lib/Ep 2.mkv"]);
}

#[test]
fn identical_copies_are_never_guessed() {
    let stored = [known(1, "/lib/Ep 1.mkv", Some(10), Some("aa"), false)];
    let scan = disk(&[("/lib/A/Ep 1.mkv", 10), ("/lib/B/Ep 1.mkv", 10)]);
    let found = identities(&[("/lib/A/Ep 1.mkv", 10, "aa"), ("/lib/B/Ep 1.mkv", 10, "aa")]);

    let plan = plan(&stored, &[], &scan, &found);
    assert!(plan.relocate.is_empty());
    assert_eq!(plan.mark_missing.len(), 1);
    assert_eq!(plan.new_files.len(), 2);
}

#[test]
fn a_video_never_fingerprinted_is_recognized_by_size_and_name() {
    let stored = [
        known(1, "/lib/Show/Ep 1.mkv", Some(10), None, false),
        known(2, "/lib/Show/Ep 2.mkv", Some(20), None, false),
    ];
    let scan = disk(&[("/lib/Moved/Ep 1.mkv", 10), ("/lib/Moved/Renamed.mkv", 20)]);
    let found = identities(&[("/lib/Moved/Ep 1.mkv", 10, "aa"), ("/lib/Moved/Renamed.mkv", 20, "bb")]);

    let plan = plan(&stored, &[], &scan, &found);
    assert_eq!(plan.relocate.len(), 1);
    assert_eq!(plan.relocate[0].0, 1);
    assert_eq!(
        plan.mark_missing.iter().map(|video| video.id).collect::<Vec<_>>(),
        vec![2]
    );
    assert_eq!(plan.new_files, vec!["/lib/Moved/Renamed.mkv"]);
}

#[test]
fn a_video_missing_elsewhere_is_recognized_when_its_file_reappears() {
    let elsewhere = [known(7, "/other/Ep 1.mkv", Some(10), Some("aa"), true)];
    let scan = disk(&[("/lib/Ep 1 (1).mkv", 10)]);
    assert_eq!(to_identify(&[], &elsewhere, &scan).len(), 1);
    let plan = plan(&[], &elsewhere, &scan, &identities(&[("/lib/Ep 1 (1).mkv", 10, "aa")]));
    assert_eq!(plan.relocate[0].0, 7);
    assert!(plan.new_files.is_empty());
}

#[test]
fn restores_found_files_sizes_old_ones_and_leaves_unreadable_folders_alone() {
    let stored = [
        known(1, "/lib/back.mkv", Some(10), Some("aa"), true),
        known(2, "/lib/old.mkv", None, None, false),
        known(3, "/lib/Locked/Ep 1.mkv", Some(30), None, false),
    ];
    let mut scan = disk(&[("/lib/back.mkv", 10), ("/lib/old.mkv", 20)]);
    scan.unreadable.push(PathBuf::from("/lib/Locked"));

    let plan = plan(&stored, &[], &scan, &HashMap::new());
    assert_eq!(plan.restore, vec![1]);
    assert_eq!(plan.sizes, vec![(2, 20)]);
    assert!(plan.mark_missing.is_empty());
    assert!(plan.new_files.is_empty());
}

#[test]
fn outermost_keeps_only_the_top_paths() {
    let paths = outermost(vec![
        PathBuf::from("/lib/Show/S1"),
        PathBuf::from("/lib/Show"),
        PathBuf::from("/lib/Show 2"),
        PathBuf::from("/lib/Show"),
    ]);
    assert_eq!(paths, vec![PathBuf::from("/lib/Show"), PathBuf::from("/lib/Show 2")]);
}

/// A library folder on disk with a database that knows it.
struct Library {
    db: Db,
    dir: tempfile::TempDir,
}

impl Library {
    async fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open_in_memory().unwrap();
        let library = Self { db, dir };
        library.add_root("Library").await;
        library
    }

    fn path(&self, relative: &str) -> PathBuf {
        relative
            .split('/')
            .fold(self.dir.path().to_path_buf(), |path, part| path.join(part))
    }

    async fn add_root(&self, relative: &str) -> PathBuf {
        let root = self.path(relative);
        std::fs::create_dir_all(&root).unwrap();
        let text = root.to_string_lossy().into_owned();
        self.db
            .call(move |connection| folders::add(connection, &text))
            .await
            .unwrap();
        root
    }

    fn write(&self, relative: &str, content: &[u8]) -> PathBuf {
        let path = self.path(relative);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, content).unwrap();
        path
    }

    /// Stores a processed video for a file on disk, fingerprinted or not, with progress and a tag.
    async fn store(&self, file: &Path, fingerprinted: bool) -> Video {
        let identity = identify(file).unwrap();
        let path = file.to_string_lossy().into_owned();
        self.db
            .call(move |connection| {
                let video = videos::insert(
                    connection,
                    &NewVideo {
                        file_path: &path,
                        title: "Kept title",
                        duration_seconds: 600.0,
                        thumbnail_path: None,
                        identity: fingerprinted.then_some(&identity),
                    },
                )?;
                watch::save_progress(connection, video.id, 120.0, 0.9, false)?;
                let tag = tags::create(connection, "favorite")?;
                tags::add_to_video(connection, video.id, tag.id)?;
                videos::get(connection, video.id)
            })
            .await
            .unwrap()
    }

    async fn reconcile(&self, paths: &[&str]) -> Reconciled {
        let paths = paths.iter().map(|path| self.path(path)).collect();
        reconcile(&self.db, paths, Duration::ZERO).await.unwrap()
    }

    async fn video(&self, id: i64) -> Option<(Video, bool, usize)> {
        self.db
            .call(move |connection| {
                let Some(video) = videos::find_by_id(connection, id)? else {
                    return Ok(None);
                };
                let missing = presence::is_missing(connection, &video.file_path)?.unwrap_or(false);
                let tags = tags::for_video(connection, id)?.len();
                Ok(Some((video, missing, tags)))
            })
            .await
            .unwrap()
    }
}

fn content(seed: u8) -> Vec<u8> {
    (0..100_000u32).map(|index| (index as u8).wrapping_mul(seed)).collect()
}

#[tokio::test]
async fn a_file_renamed_while_the_app_was_closed_keeps_progress_tags_and_title() {
    let library = Library::new().await;
    let original = library.write("Library/Show/Ep 1.mkv", &content(3));
    let video = library.store(&original, true).await;
    std::fs::rename(&original, library.path("Library/Show/S01E01 - Pilot.mkv")).unwrap();

    let reconciled = library.reconcile(&["Library"]).await;
    assert!(reconciled.changed);
    assert!(reconciled.new_files.is_empty());
    let (moved, missing, tags) = library.video(video.id).await.unwrap();
    assert_eq!(
        PathBuf::from(&moved.file_path),
        library.path("Library/Show/S01E01 - Pilot.mkv")
    );
    assert!(!missing);
    assert_eq!(tags, 1);
    assert_eq!(moved.title, "Kept title");
    assert_eq!(moved.watch_progress_seconds, 120.0);
}

#[tokio::test]
async fn a_file_moved_to_another_library_folder_keeps_its_video() {
    let library = Library::new().await;
    library.add_root("Other").await;
    let original = library.write("Library/Ep 1.mkv", &content(5));
    // Stored before 2.3: the first comparison records its size, enough to follow it by name.
    let video = library.store(&original, false).await;
    library.reconcile(&["Library"]).await;
    std::fs::rename(&original, library.path("Other/Ep 1.mkv")).unwrap();

    library.reconcile(&["Library", "Other"]).await;
    let (moved, missing, _) = library.video(video.id).await.unwrap();
    assert_eq!(PathBuf::from(&moved.file_path), library.path("Other/Ep 1.mkv"));
    assert!(!missing);
}

#[tokio::test]
async fn a_deleted_file_is_marked_missing_and_restored_when_it_comes_back() {
    let library = Library::new().await;
    let file = library.write("Library/Ep 1.mkv", &content(7));
    let video = library.store(&file, true).await;
    let saved = std::fs::read(&file).unwrap();
    std::fs::remove_file(&file).unwrap();

    assert!(library.reconcile(&["Library/Ep 1.mkv"]).await.changed);
    assert!(library.video(video.id).await.unwrap().1);

    std::fs::write(&file, saved).unwrap();
    assert!(library.reconcile(&["Library"]).await.changed);
    let (back, missing, tags) = library.video(video.id).await.unwrap();
    assert!(!missing);
    assert_eq!(tags, 1);
    assert_eq!(back.watch_progress_seconds, 120.0);
}

#[tokio::test]
async fn an_unreachable_library_folder_never_loses_its_videos() {
    let library = Library::new().await;
    let file = library.write("Library/Show/Ep 1.mkv", &content(9));
    let video = library.store(&file, true).await;
    // An unplugged drive: the whole library folder is gone.
    std::fs::remove_dir_all(library.path("Library")).unwrap();

    let reconciled = library.reconcile(&["Library", "Library/Show/Ep 1.mkv"]).await;
    assert!(!reconciled.changed);
    assert!(!library.video(video.id).await.unwrap().1);
}

#[tokio::test]
async fn paths_outside_the_library_are_ignored() {
    let library = Library::new().await;
    library.write("Elsewhere/Ep 1.mkv", &content(2));
    let reconciled = library.reconcile(&["Elsewhere"]).await;
    assert!(reconciled.new_files.is_empty());
}

#[tokio::test]
async fn new_files_still_being_written_are_deferred() {
    let library = Library::new().await;
    library.write("Library/Ready.mkv", &content(4));
    let growing = library.write("Library/Copying.mkv", &content(6));
    let writer = {
        let growing = growing.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            let mut bytes = std::fs::read(&growing).unwrap();
            bytes.extend_from_slice(b"more");
            std::fs::write(&growing, bytes).unwrap();
        })
    };

    let paths = vec![library.path("Library")];
    let reconciled = reconcile(&library.db, paths, Duration::from_millis(300)).await.unwrap();
    writer.await.unwrap();
    assert_eq!(reconciled.new_files, vec![library.path("Library/Ready.mkv")]);
    assert_eq!(reconciled.deferred, vec![growing]);
}
