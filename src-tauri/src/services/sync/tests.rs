//! The sync loop end to end, with the real file system watcher and the processing pipeline over a fake toolkit.

use std::sync::atomic::{AtomicUsize, Ordering};

use super::*;
use crate::db::videos::{self, NewVideo};
use crate::db::{folders, presence, tags};
use crate::domain::folder_view::FolderViewMode;
use crate::services::media::processing::tests::{FakeToolkit, Harness};

const TEST_TIMING: Timing = Timing {
    start_delay: Duration::ZERO,
    debounce: Duration::from_millis(100),
    settle: Duration::from_millis(50),
    check_interval: Duration::from_millis(100),
    poll_interval: Duration::from_millis(300),
    retry_delay: Duration::from_millis(100),
    idle_check: Duration::from_millis(10),
};

struct Fixture {
    harness: Harness,
    sync: LibrarySync<FakeToolkit>,
    dir: tempfile::TempDir,
    library_changed: Arc<AtomicUsize>,
}

impl Fixture {
    /// A library folder `Library` with the given files, known to the database, and a sync not started yet.
    async fn new(files: &[&str], enabled: bool) -> Self {
        let dir = tempfile::tempdir().unwrap();
        let harness = Harness::new(FakeToolkit::default(), 2);
        let library_changed = Arc::new(AtomicUsize::new(0));
        let notify: SyncNotifier = {
            let library_changed = Arc::clone(&library_changed);
            Arc::new(move |notification| {
                if let SyncNotification::LibraryChanged = notification {
                    library_changed.fetch_add(1, Ordering::SeqCst);
                }
            })
        };
        let sync = LibrarySync::new(
            harness.db.clone(),
            harness.processor.clone(),
            harness.thumbnails_dir.path().to_path_buf(),
            enabled,
            TEST_TIMING,
            notify,
        );
        let fixture = Self {
            harness,
            sync,
            dir,
            library_changed,
        };
        let root = fixture.path("Library");
        std::fs::create_dir_all(&root).unwrap();
        let root = root.to_string_lossy().into_owned();
        fixture
            .harness
            .db
            .call(move |connection| folders::add(connection, &root))
            .await
            .unwrap();
        for file in files {
            fixture.write(file, file.as_bytes());
        }
        fixture
    }

    fn path(&self, relative: &str) -> PathBuf {
        relative
            .split('/')
            .fold(self.dir.path().to_path_buf(), |path, part| path.join(part))
    }

    fn text(&self, relative: &str) -> String {
        self.path(relative).to_string_lossy().into_owned()
    }

    fn write(&self, relative: &str, content: &[u8]) {
        let path = self.path(relative);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, content).unwrap();
    }

    /// Stores a video as an old version would have: no size, no fingerprint, with a tag.
    async fn store_legacy(&self, relative: &str) -> i64 {
        let path = self.text(relative);
        self.harness
            .db
            .call(move |connection| {
                let video = videos::insert(
                    connection,
                    &NewVideo {
                        file_path: &path,
                        title: "Kept title",
                        duration_seconds: 60.0,
                        thumbnail_path: None,
                        identity: None,
                    },
                )?;
                let tag = tags::find_or_create(connection, "favorite")?;
                tags::add_to_video(connection, video.id, tag.id)?;
                Ok(video.id)
            })
            .await
            .unwrap()
    }

    async fn video_path(&self, id: i64) -> Option<String> {
        self.harness
            .db
            .call(move |connection| Ok(videos::find_by_id(connection, id)?.map(|video| video.file_path)))
            .await
            .unwrap()
    }

    async fn missing(&self, relative: &str) -> Option<bool> {
        let path = self.text(relative);
        self.harness
            .db
            .call(move |connection| presence::is_missing(connection, &path))
            .await
            .unwrap()
    }

    fn watch_of(&self, relative: &str) -> Option<FolderWatch> {
        let path = self.text(relative);
        self.sync
            .statuses()
            .into_iter()
            .find(|status| status.path == path)
            .map(|status| status.watch)
    }
}

/// Waits until `condition` holds, failing after a few seconds.
async fn eventually<F, Fut>(what: &str, mut condition: F)
where
    F: FnMut() -> Fut,
    Fut: Future<Output = bool>,
{
    let deadline = Instant::now() + Duration::from_secs(10);
    while !condition().await {
        assert!(Instant::now() < deadline, "timed out waiting until {what}");
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

#[tokio::test]
async fn startup_reads_new_files_and_fingerprints_old_videos() {
    let fixture = Fixture::new(&["Library/Ep 1.mkv", "Library/New.mkv"], true).await;
    let legacy = fixture.store_legacy("Library/Ep 1.mkv").await;
    fixture.sync.start();

    assert_eq!(fixture.harness.outcomes(1).await[0].summary.processed, 1);
    assert_eq!(fixture.watch_of("Library"), Some(FolderWatch::Watching));
    eventually("the old video is fingerprinted", || async {
        let pending = fixture
            .harness
            .db
            .call(|connection| presence::without_fingerprint(connection, 0, 10))
            .await
            .unwrap();
        !pending.iter().any(|(id, _)| *id == legacy)
    })
    .await;
    assert!(fixture.library_changed.load(Ordering::SeqCst) > 0);
}

#[tokio::test]
async fn follows_renames_deletions_and_new_files_as_they_happen() {
    let fixture = Fixture::new(&["Library/Show/Ep 1.mkv", "Library/Show/Ep 2.mkv"], true).await;
    let first = fixture.store_legacy("Library/Show/Ep 1.mkv").await;
    fixture.store_legacy("Library/Show/Ep 2.mkv").await;
    fixture.sync.start();
    eventually("the folder is watched", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Watching)
    })
    .await;

    std::fs::rename(
        fixture.path("Library/Show/Ep 1.mkv"),
        fixture.path("Library/Show/Pilot.mkv"),
    )
    .unwrap();
    let pilot = fixture.text("Library/Show/Pilot.mkv");
    eventually("the rename is followed", || async {
        fixture.video_path(first).await.as_deref() == Some(pilot.as_str())
    })
    .await;

    std::fs::remove_file(fixture.path("Library/Show/Ep 2.mkv")).unwrap();
    eventually("the deleted file is missing", || async {
        fixture.missing("Library/Show/Ep 2.mkv").await == Some(true)
    })
    .await;

    fixture.write("Library/Show/Ep 3.mkv", b"new episode");
    let outcome = fixture.harness.outcomes(1).await.remove(0);
    assert_eq!(outcome.summary.processed, 1);
    assert_eq!(fixture.missing("Library/Show/Ep 3.mkv").await, Some(false));
}

#[tokio::test]
async fn a_renamed_folder_keeps_its_videos_and_view_mode() {
    let fixture = Fixture::new(&["Library/Show/Ep 1.mkv"], true).await;
    let video = fixture.store_legacy("Library/Show/Ep 1.mkv").await;
    let show = fixture.text("Library/Show");
    fixture
        .harness
        .db
        .call(move |connection| folders::set_view_mode(connection, &show, Some(FolderViewMode::Continuous)))
        .await
        .unwrap();
    fixture.sync.start();
    eventually("the folder is watched", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Watching)
    })
    .await;

    std::fs::rename(fixture.path("Library/Show"), fixture.path("Library/Renamed show")).unwrap();
    let moved = fixture.text("Library/Renamed show/Ep 1.mkv");
    eventually("the folder rename is followed", || async {
        fixture.video_path(video).await.as_deref() == Some(moved.as_str())
    })
    .await;
    let modes = fixture
        .harness
        .db
        .call(|connection| folders::view_modes(connection))
        .await
        .unwrap();
    assert_eq!(
        modes,
        vec![(fixture.text("Library/Renamed show"), FolderViewMode::Continuous)]
    );
}

#[tokio::test]
async fn an_unplugged_folder_keeps_its_videos_and_is_compared_when_it_comes_back() {
    let fixture = Fixture::new(&["Library/Ep 1.mkv", "Library/Ep 2.mkv"], true).await;
    let video = fixture.store_legacy("Library/Ep 1.mkv").await;
    fixture.sync.start();
    eventually("the folder is watched", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Watching)
    })
    .await;
    fixture.harness.outcomes(1).await;

    // Like an unplugged drive: the folder is gone as a whole.
    std::fs::rename(fixture.path("Library"), fixture.path("Unplugged")).unwrap();
    eventually("the folder is unavailable", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Unavailable)
    })
    .await;
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert_eq!(fixture.missing("Library/Ep 1.mkv").await, Some(false));

    std::fs::remove_file(fixture.path("Unplugged/Ep 2.mkv")).unwrap();
    std::fs::rename(fixture.path("Unplugged"), fixture.path("Library")).unwrap();
    eventually("the folder is watched again", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Watching)
    })
    .await;
    eventually("what changed meanwhile is found", || async {
        fixture.missing("Library/Ep 2.mkv").await == Some(true)
    })
    .await;
    assert!(fixture.video_path(video).await.is_some());
}

#[tokio::test]
async fn with_watching_off_changes_wait_for_a_sync() {
    let fixture = Fixture::new(&["Library/Ep 1.mkv"], false).await;
    fixture.store_legacy("Library/Ep 1.mkv").await;
    fixture.sync.start();
    eventually("the folder is listed", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Off)
    })
    .await;

    std::fs::remove_file(fixture.path("Library/Ep 1.mkv")).unwrap();
    tokio::time::sleep(Duration::from_millis(400)).await;
    assert_eq!(fixture.missing("Library/Ep 1.mkv").await, Some(false));

    fixture.sync.reconcile_now(vec![fixture.path("Library")]).await;
    assert_eq!(fixture.missing("Library/Ep 1.mkv").await, Some(true));

    fixture.sync.set_enabled(true);
    eventually("the folder is watched", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Watching)
    })
    .await;
}

#[tokio::test]
async fn startup_deletes_videos_missing_for_thirty_days() {
    let fixture = Fixture::new(&[], true).await;
    let old = fixture.store_legacy("Library/Old.mkv").await;
    let recent = fixture.store_legacy("Library/Recent.mkv").await;
    fixture
        .harness
        .db
        .call(move |connection| {
            connection.execute(
                "UPDATE videos SET missing_since = datetime('now', '-31 days') WHERE id = ?1",
                [old],
            )?;
            connection.execute(
                "UPDATE videos SET missing_since = CURRENT_TIMESTAMP WHERE id = ?1",
                [recent],
            )?;
            Ok(())
        })
        .await
        .unwrap();

    fixture.sync.start();
    eventually("the old missing video is deleted", || async {
        fixture.video_path(old).await.is_none()
    })
    .await;
    assert!(fixture.video_path(recent).await.is_some());
}

#[tokio::test]
async fn added_and_removed_folders_are_picked_up() {
    let fixture = Fixture::new(&[], true).await;
    fixture.sync.start();
    eventually("the folder is watched", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Watching)
    })
    .await;

    fixture.write("Second/Ep 1.mkv", b"episode");
    let second = fixture.text("Second");
    fixture
        .harness
        .db
        .call(move |connection| folders::add(connection, &second))
        .await
        .unwrap();
    fixture.sync.refresh();
    eventually("the new folder is watched", || async {
        fixture.watch_of("Second") == Some(FolderWatch::Watching)
    })
    .await;
    assert_eq!(fixture.harness.outcomes(1).await[0].summary.processed, 1);

    let library = fixture.text("Library");
    fixture
        .harness
        .db
        .call(move |connection| folders::remove(connection, &library))
        .await
        .unwrap();
    fixture.sync.refresh();
    eventually("the removed folder is dropped", || async {
        fixture.watch_of("Library").is_none()
    })
    .await;
}
