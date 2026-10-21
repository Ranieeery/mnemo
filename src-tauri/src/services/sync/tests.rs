//! The sync loop end to end, with the real file system watcher and the processing pipeline over a fake toolkit.

use std::sync::atomic::{AtomicUsize, Ordering};

use rusqlite::OptionalExtension;

use super::*;
use crate::db::videos::{self, NewVideo};
use crate::db::{backup, folders, hidden, presence, tags};
use crate::domain::folder_view::FolderViewMode;
use crate::services::media::processing::Priority;
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
        Self::with_toolkit(files, enabled, FakeToolkit::default()).await
    }

    async fn with_toolkit(files: &[&str], enabled: bool, toolkit: FakeToolkit) -> Self {
        let dir = tempfile::tempdir().unwrap();
        let harness = Harness::new(toolkit, 2);
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

    /// The stored size of the video at `path`: `None` when it is not stored.
    async fn file_size(&self, path: &str) -> Option<Option<i64>> {
        let path = path.to_owned();
        self.harness
            .db
            .call(move |connection| {
                Ok(connection
                    .query_row("SELECT file_size FROM videos WHERE file_path = ?1", [&path], |row| {
                        row.get(0)
                    })
                    .optional()?)
            })
            .await
            .unwrap()
    }

    async fn export(&self) -> LibraryFile {
        self.harness
            .db
            .call(|connection| backup::export(connection))
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
async fn a_renamed_folder_keeps_its_videos_view_mode_and_hidden_state() {
    let fixture = Fixture::new(&["Library/Show/Ep 1.mkv"], true).await;
    let video = fixture.store_legacy("Library/Show/Ep 1.mkv").await;
    let show = fixture.text("Library/Show");
    fixture
        .harness
        .db
        .call(move |connection| {
            folders::set_view_mode(connection, &show, Some(FolderViewMode::Continuous))?;
            hidden::hide(connection, &show)
        })
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
    let hidden_folders = fixture
        .harness
        .db
        .call(|connection| hidden::list(connection))
        .await
        .unwrap();
    assert_eq!(hidden_folders, [fixture.text("Library/Renamed show")]);
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

    fixture.sync.reconcile_now(vec![fixture.path("Library")]).await.unwrap();
    assert_eq!(fixture.missing("Library/Ep 1.mkv").await, Some(true));
}

#[tokio::test]
async fn turning_watching_on_compares_what_changed_while_off() {
    // Regression: what changed while watching was off was only found at the next start or "Sync".
    let fixture = Fixture::new(&["Library/Ep 1.mkv"], false).await;
    fixture.store_legacy("Library/Ep 1.mkv").await;
    fixture.sync.start();
    eventually("the folder is listed", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Off)
    })
    .await;
    std::fs::remove_file(fixture.path("Library/Ep 1.mkv")).unwrap();
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert_eq!(fixture.missing("Library/Ep 1.mkv").await, Some(false));

    fixture.sync.set_enabled(true);
    eventually("what changed while off is found", || async {
        fixture.missing("Library/Ep 1.mkv").await == Some(true)
    })
    .await;
    assert_eq!(fixture.watch_of("Library"), Some(FolderWatch::Watching));
}

#[tokio::test]
async fn a_folder_past_the_watch_limit_is_compared_periodically() {
    let fixture = Fixture::new(&["Library/Ep 1.mkv"], true).await;
    fixture.store_legacy("Library/Ep 1.mkv").await;
    let unplugged = fixture.text("Unplugged");
    fixture
        .harness
        .db
        .call(move |connection| folders::add(connection, &unplugged))
        .await
        .unwrap();
    fixture.sync.start();
    eventually("the folder is watched", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Watching)
    })
    .await;
    assert_eq!(fixture.watch_of("Unplugged"), Some(FolderWatch::Unavailable));

    // A failure naming no path, as some platforms report the limit.
    fixture
        .sync
        .inner
        .requests
        .send(Request::WatchFailed {
            paths: Vec::new(),
            reason: "limit reached".to_owned(),
            limit: true,
        })
        .unwrap();
    eventually("the folder is compared periodically", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Polling)
    })
    .await;
    // Regression: the failure also turned folders that were not watched into periodically compared ones.
    assert_eq!(fixture.watch_of("Unplugged"), Some(FolderWatch::Unavailable));
    let status = fixture
        .sync
        .statuses()
        .into_iter()
        .find(|status| status.path == fixture.text("Library"));
    assert_eq!(
        status.and_then(|status| status.reason).as_deref(),
        Some("limit reached")
    );

    // Nothing watches the folder anymore: only the periodic comparison can find this.
    tokio::time::sleep(Duration::from_millis(100)).await;
    std::fs::remove_file(fixture.path("Library/Ep 1.mkv")).unwrap();
    eventually("the periodic comparison finds the change", || async {
        fixture.missing("Library/Ep 1.mkv").await == Some(true)
    })
    .await;
    assert_eq!(fixture.watch_of("Library"), Some(FolderWatch::Polling));
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

#[tokio::test]
async fn a_located_folder_is_watched_and_compared_at_its_new_path() {
    let fixture = Fixture::new(&["Library/Ep 1.mkv", "Library/Ep 2.mkv"], true).await;
    let kept = fixture.store_legacy("Library/Ep 1.mkv").await;
    fixture.store_legacy("Library/Ep 2.mkv").await;
    let library = fixture.text("Library");
    fixture
        .harness
        .db
        .call(move |connection| folders::set_custom_name(connection, &library, Some("My shows")))
        .await
        .unwrap();
    fixture.sync.start();
    eventually("the folder is watched", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Watching)
    })
    .await;

    // Moved outside the app, losing one video and gaining another on the way.
    std::fs::rename(fixture.path("Library"), fixture.path("Moved")).unwrap();
    std::fs::remove_file(fixture.path("Moved/Ep 2.mkv")).unwrap();
    fixture.write("Moved/Ep 3.mkv", b"new episode");
    eventually("the folder is unavailable", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Unavailable)
    })
    .await;
    // The watcher does not follow a library folder renamed on disk: it keeps its row, and its name, until located.
    let library = fixture.text("Library");
    let unplugged = fixture
        .harness
        .db
        .call(move |connection| folders::find(connection, &library))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(unplugged.name, "My shows");

    let result = fixture
        .sync
        .relocate(fixture.text("Library"), fixture.text("Moved"))
        .await
        .unwrap();
    assert_eq!(result.folder.path, fixture.text("Moved"));
    assert_eq!(
        (result.folder.name.as_str(), result.folder.folder_name.as_str()),
        ("My shows", "Moved")
    );
    assert_eq!((result.total_videos, result.found_videos), (2, 1));
    assert_eq!(fixture.watch_of("Moved"), Some(FolderWatch::Watching));
    assert_eq!(fixture.watch_of("Library"), None);
    assert_eq!(fixture.video_path(kept).await, Some(fixture.text("Moved/Ep 1.mkv")));
    assert_eq!(fixture.missing("Moved/Ep 2.mkv").await, Some(true));
    assert_eq!(fixture.harness.outcomes(1).await[0].summary.processed, 1);

    // Watched at the new path like any library folder.
    fixture.write("Moved/Ep 4.mkv", b"another episode");
    assert_eq!(fixture.harness.outcomes(1).await[0].summary.processed, 1);
}

#[tokio::test]
async fn an_import_applies_its_watching_setting_right_away() {
    // Regression: the imported "Watch folders for changes" was stored, but watching only changed after a restart.
    let fixture = Fixture::new(&[], true).await;
    fixture.sync.start();
    eventually("the folder is watched", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Watching)
    })
    .await;
    let mut file = fixture.export().await;

    for (watch_folders, expected) in [(false, FolderWatch::Off), (true, FolderWatch::Watching)] {
        if let Some(settings) = file.settings.as_mut() {
            settings.watch_folders = Some(watch_folders);
        }
        fixture.sync.import(file.clone()).await.unwrap();
        assert_eq!(fixture.watch_of("Library"), Some(expected));
    }
}

#[tokio::test]
async fn an_import_compares_the_imported_folders_with_the_disk() {
    let fixture = Fixture::new(&[], false).await;
    fixture.store_legacy("Library/Kept.mkv").await;
    fixture.store_legacy("Library/Gone.mkv").await;
    let file = fixture.export().await;
    fixture
        .harness
        .db
        .call(|connection| Ok(connection.execute_batch("DELETE FROM video_tags; DELETE FROM videos;")?))
        .await
        .unwrap();
    fixture.sync.start();
    eventually("the startup comparison ran", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Off)
    })
    .await;
    fixture.write("Library/Kept.mkv", b"kept");
    fixture.write("Library/New.mkv", b"new");

    let summary = fixture.sync.import(file).await.unwrap();

    assert_eq!(summary.videos, 2);
    assert_eq!(fixture.missing("Library/Kept.mkv").await, Some(false));
    assert_eq!(fixture.missing("Library/Gone.mkv").await, Some(true));
    let outcomes = fixture.harness.outcomes(1).await;
    assert_eq!(outcomes[0].summary.processed, 1);
}

#[tokio::test]
async fn an_import_stops_reading_the_folders_it_replaced() {
    let fixture = Fixture::with_toolkit(
        &["Library/Ep 1.mkv", "Library/Ep 2.mkv", "Library/Ep 3.mkv"],
        false,
        FakeToolkit::slow(Duration::from_millis(200)),
    )
    .await;
    let mut file = fixture.export().await;
    std::fs::create_dir_all(fixture.path("Other")).unwrap();
    file.library_folders[0].path = fixture.text("Other");
    fixture.sync.start();
    eventually("the folder is being read", || async {
        !fixture.harness.toolkit().probed.lock().unwrap().is_empty()
    })
    .await;

    fixture.sync.import(file).await.unwrap();

    let outcomes = fixture.harness.outcomes(1).await;
    assert_eq!(outcomes[0].folder, fixture.text("Library"));
    assert!(outcomes[0].cancelled && outcomes[0].removed);
    assert!(fixture.harness.stored().await.is_empty());
}

#[tokio::test]
async fn a_refused_import_keeps_reading_the_current_folders() {
    let fixture = Fixture::with_toolkit(
        &["Library/Ep 1.mkv"],
        false,
        FakeToolkit::slow(Duration::from_millis(100)),
    )
    .await;
    let mut file = fixture.export().await;
    file.library_folders.push(file.library_folders[0].clone());
    fixture.sync.start();
    eventually("the folder is being read", || async {
        !fixture.harness.toolkit().probed.lock().unwrap().is_empty()
    })
    .await;

    assert!(fixture.sync.import(file).await.is_err());

    let outcomes = fixture.harness.outcomes(1).await;
    assert!(!outcomes[0].cancelled);
    assert_eq!(outcomes[0].summary.processed, 1);
}

#[tokio::test]
async fn startup_keeps_old_missing_videos_of_unplugged_folders() {
    let fixture = Fixture::new(&[], true).await;
    std::fs::create_dir_all(fixture.path("Other")).unwrap();
    let other = fixture.text("Other");
    fixture
        .harness
        .db
        .call(move |connection| folders::add(connection, &other))
        .await
        .unwrap();
    let unplugged = fixture.store_legacy("Library/Old.mkv").await;
    let reachable = fixture.store_legacy("Other/Old.mkv").await;
    fixture
        .harness
        .db
        .call(|connection| Ok(connection.execute("UPDATE videos SET missing_since = datetime('now', '-31 days')", [])?))
        .await
        .unwrap();
    std::fs::remove_dir_all(fixture.path("Library")).unwrap();

    fixture.sync.start();
    // Both are deleted by the same statement, so once one is gone the other was considered too.
    eventually("the old missing video of the reachable folder is deleted", || async {
        fixture.video_path(reachable).await.is_none()
    })
    .await;
    assert!(fixture.video_path(unplugged).await.is_some());
}

#[tokio::test]
async fn a_new_file_is_read_without_its_siblings_still_being_copied() {
    // Regression: the new file's whole folder was read, including a file next to it still being copied.
    let fixture = Fixture::new(&[], true).await;
    fixture.sync.start();
    eventually("the folder is watched", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Watching)
    })
    .await;
    let copying = fixture.path("Library/Show/Extras/Big.mkv");
    fixture.write("Library/Show/Extras/Big.mkv", b"start");
    let copy = tokio::spawn(async move {
        for _ in 0..50 {
            tokio::time::sleep(Duration::from_millis(20)).await;
            let mut file = std::fs::OpenOptions::new().append(true).open(&copying).unwrap();
            std::io::Write::write_all(&mut file, b"more").unwrap();
        }
    });
    fixture.write("Library/Show/Ep 3.mkv", b"new episode");

    eventually("the new file is read", || async {
        fixture.missing("Library/Show/Ep 3.mkv").await == Some(false)
    })
    .await;
    assert!(!copy.is_finished(), "the copy should still be going");
    assert_eq!(*fixture.harness.toolkit().probed.lock().unwrap(), ["Ep 3.mkv"]);

    copy.await.unwrap();
    let big = fixture.text("Library/Show/Extras/Big.mkv");
    let complete = std::fs::metadata(&big).unwrap().len() as i64;
    eventually("the copied file is read once complete", || async {
        fixture.file_size(&big).await == Some(Some(complete))
    })
    .await;
}

#[tokio::test]
async fn a_sync_leaves_files_still_being_copied_for_later() {
    // Regression: "Sync" read the whole folder again after comparing it, including a file the comparison had left for
    // later because it was still being copied, and stored it half copied.
    let fixture = Fixture::new(&[], false).await;
    fixture.sync.start();
    eventually("the folder is listed", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Off)
    })
    .await;
    let copying = fixture.path("Library/Big.mkv");
    fixture.write("Library/Big.mkv", b"start");
    let copy = tokio::spawn(async move {
        for _ in 0..50 {
            tokio::time::sleep(Duration::from_millis(20)).await;
            let mut file = std::fs::OpenOptions::new().append(true).open(&copying).unwrap();
            std::io::Write::write_all(&mut file, b"more").unwrap();
        }
    });
    fixture.write("Library/Ep 1.mkv", b"new episode");

    // What `process_folders` does.
    let library = fixture.path("Library");
    let new_files = fixture.sync.reconcile_now(vec![library.clone()]).await.unwrap();
    assert_eq!(new_files, [fixture.path("Library/Ep 1.mkv")]);
    fixture
        .harness
        .processor
        .enqueue(library, new_files, Priority::Normal, true);
    eventually("the new file is read", || async {
        fixture.missing("Library/Ep 1.mkv").await == Some(false)
    })
    .await;
    assert!(!copy.is_finished(), "the copy should still be going");
    assert_eq!(*fixture.harness.toolkit().probed.lock().unwrap(), ["Ep 1.mkv"]);

    copy.await.unwrap();
    let big = fixture.text("Library/Big.mkv");
    let complete = std::fs::metadata(&big).unwrap().len() as i64;
    eventually("the copied file is read once complete", || async {
        fixture.file_size(&big).await == Some(Some(complete))
    })
    .await;
}

#[tokio::test]
async fn a_renamed_library_folder_inside_another_one_follows_it() {
    // Regression: the videos moved with the folder, but the library kept the old path, now "not connected".
    let fixture = Fixture::new(&["Library/Anime/Ep 1.mkv"], true).await;
    let video = fixture.store_legacy("Library/Anime/Ep 1.mkv").await;
    let nested = fixture.text("Library/Anime");
    fixture
        .harness
        .db
        .call(move |connection| folders::add(connection, &nested))
        .await
        .unwrap();
    fixture.sync.start();
    eventually("both folders are watched", || async {
        fixture.watch_of("Library") == Some(FolderWatch::Watching)
            && fixture.watch_of("Library/Anime") == Some(FolderWatch::Watching)
    })
    .await;

    std::fs::rename(fixture.path("Library/Anime"), fixture.path("Library/Shows")).unwrap();
    let moved = fixture.text("Library/Shows/Ep 1.mkv");
    eventually("the rename is followed", || async {
        fixture.video_path(video).await.as_deref() == Some(moved.as_str())
            && fixture.watch_of("Library/Shows") == Some(FolderWatch::Watching)
    })
    .await;
    let library = fixture
        .harness
        .db
        .call(|connection| folders::paths(connection))
        .await
        .unwrap();
    assert!(library.contains(&fixture.text("Library/Shows")));
    assert!(!library.contains(&fixture.text("Library/Anime")));
    assert_eq!(fixture.watch_of("Library/Anime"), None);
}
