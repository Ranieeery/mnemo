//! Library search (database) and folder search (disk, including videos not processed yet).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use crate::db::{Db, folders, hidden, videos};
use crate::domain::hidden::HiddenFolders;
use crate::domain::media::display_name;
use crate::domain::models::{SearchProgress, Video, VideoEntry};
use crate::domain::natural_order::natural_cmp;
use crate::error::{AppError, AppResult};
use crate::services::library::ensure_in_library;
use crate::services::scanner;

const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

/// Lets a new folder search supersede the running one: each search takes a ticket and stops as soon as a newer
/// ticket exists, so typing quickly never leaves stale disk scans behind.
#[derive(Default, Clone)]
pub struct SearchGate {
    latest: Arc<AtomicU64>,
}

impl SearchGate {
    fn begin(&self) -> u64 {
        self.latest.fetch_add(1, Ordering::SeqCst) + 1
    }

    fn is_current(&self, ticket: u64) -> bool {
        self.latest.load(Ordering::SeqCst) == ticket
    }
}

pub async fn search_library(db: &Db, query: String, limit: i64) -> AppResult<Vec<Video>> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let mut results = db
        .call(move |connection| videos::search(connection, &query, limit))
        .await?;
    results.sort_by(|a, b| natural_cmp(&a.title, &b.title));
    Ok(results)
}

/// Recursively searches the file names below `folder`, leaving out the hidden folders inside it. Returns
/// [`AppError::Cancelled`] if a newer search started.
pub async fn search_folder(
    db: &Db,
    gate: &SearchGate,
    folder: String,
    query: String,
    on_progress: impl Fn(SearchProgress) + Send + 'static,
) -> AppResult<Vec<VideoEntry>> {
    let ticket = gate.begin();
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let library_check = folder.clone();
    let hidden_folders = db
        .call(move |connection| {
            ensure_in_library(library_check.as_ref(), &folders::paths(connection)?)?;
            Ok(HiddenFolders::new(hidden::list(connection)?))
        })
        .await?;

    let root = PathBuf::from(&folder);
    let walk_gate = gate.clone();
    let files = tokio::task::spawn_blocking(move || {
        let mut last_report: Option<Instant> = None;
        let concealed = |path: &Path| hidden_folders.conceals(path, &root);
        scanner::walk_videos(&root, concealed, |current_folder, scanned_files| {
            if !walk_gate.is_current(ticket) {
                return Err(AppError::Cancelled);
            }
            if last_report.is_none_or(|reported| reported.elapsed() >= PROGRESS_INTERVAL) {
                last_report = Some(Instant::now());
                on_progress(SearchProgress {
                    scanned_files: scanned_files as i64,
                    current_folder: current_folder.to_string_lossy().into_owned(),
                });
            }
            Ok(())
        })
    })
    .await??;

    let mut matches: Vec<PathBuf> = files
        .into_iter()
        .filter(|file| display_name(file).to_lowercase().contains(&needle))
        .collect();
    matches.sort_by(|a, b| natural_cmp(&a.to_string_lossy(), &b.to_string_lossy()));

    let mut records: HashMap<String, Video> = db
        .call(move |connection| videos::in_folder(connection, &folder, true))
        .await?
        .into_iter()
        .map(|video| (video.file_path.clone(), video))
        .collect();
    if !gate.is_current(ticket) {
        return Err(AppError::Cancelled);
    }
    Ok(matches
        .into_iter()
        .map(|file| {
            let path = file.to_string_lossy().into_owned();
            VideoEntry {
                name: display_name(&file),
                video: records.remove(&path),
                path,
            }
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::library;
    use crate::services::scanner::tests::tree;

    #[tokio::test]
    async fn finds_processed_and_unprocessed_videos_by_file_name() {
        let dir = tree(&[
            "Lib/Ep 10 Finale.mkv",
            "Lib/sub/Ep 2 finale.mp4",
            "Lib/other.mkv",
            "Lib/finale.txt",
        ]);
        let root = dir.path().join("Lib").to_string_lossy().into_owned();
        let db = Db::open_in_memory().unwrap();
        library::add_folder(&db, root.clone()).await.unwrap();
        let processed = dir
            .path()
            .join("Lib")
            .join("Ep 10 Finale.mkv")
            .to_string_lossy()
            .into_owned();
        db.call(move |connection| {
            videos::insert(
                connection,
                &videos::NewVideo {
                    file_path: &processed,
                    title: "Finale",
                    duration_seconds: 1.0,
                    thumbnail_path: None,
                    identity: None,
                },
            )
        })
        .await
        .unwrap();

        let gate = SearchGate::default();
        let results = search_folder(&db, &gate, root, "FINALE".into(), |_| {}).await.unwrap();
        let names: Vec<_> = results.iter().map(|entry| entry.name.as_str()).collect();
        assert_eq!(names, vec!["Ep 10 Finale.mkv", "Ep 2 finale.mp4"]);
        assert!(results[0].video.is_some());
        assert!(results[1].video.is_none());
    }

    #[tokio::test]
    async fn skips_hidden_folders_below_the_searched_one() {
        let dir = tree(&["Lib/Private/ep 1.mkv", "Lib/Private 2/ep 2.mkv", "Lib/ep 3.mkv"]);
        let root = dir.path().join("Lib");
        let private = root.join("Private").to_string_lossy().into_owned();
        let db = Db::open_in_memory().unwrap();
        library::add_folder(&db, root.to_string_lossy().into_owned())
            .await
            .unwrap();
        let hidden_folder = private.clone();
        db.call(move |connection| hidden::hide(connection, &hidden_folder))
            .await
            .unwrap();
        let gate = SearchGate::default();

        let names = |results: Vec<VideoEntry>| results.into_iter().map(|entry| entry.name).collect::<Vec<_>>();
        let from_root = search_folder(&db, &gate, root.to_string_lossy().into_owned(), "ep".into(), |_| {})
            .await
            .unwrap();
        assert_eq!(names(from_root), ["ep 3.mkv", "ep 2.mkv"]);
        let from_inside = search_folder(&db, &gate, private, "ep".into(), |_| {}).await.unwrap();
        assert_eq!(names(from_inside), ["ep 1.mkv"]);
    }

    #[tokio::test]
    async fn a_newer_search_cancels_the_running_one() {
        let dir = tree(&["Lib/a.mkv"]);
        let root = dir.path().join("Lib").to_string_lossy().into_owned();
        let db = Db::open_in_memory().unwrap();
        library::add_folder(&db, root.clone()).await.unwrap();
        let gate = SearchGate::default();
        let superseding_gate = gate.clone();

        let result = search_folder(&db, &gate, root, "a".into(), move |_| {
            superseding_gate.begin();
        })
        .await;
        assert!(matches!(result, Err(AppError::Cancelled)));
    }

    #[tokio::test]
    async fn blank_queries_return_nothing() {
        let db = Db::open_in_memory().unwrap();
        assert!(search_library(&db, "  ".into(), 10).await.unwrap().is_empty());
        let gate = SearchGate::default();
        assert!(
            search_folder(&db, &gate, "anywhere".into(), " ".into(), |_| {})
                .await
                .unwrap()
                .is_empty()
        );
    }
}
