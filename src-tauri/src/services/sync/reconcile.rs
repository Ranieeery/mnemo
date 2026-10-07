//! Compares what is on disk below some paths with what the library stored, and brings the library up to date:
//! files found again are restored, renamed or moved files keep their record (and so their progress, tags and
//! history), vanished files are marked missing and new files are handed back to be read.
//!
//! Nothing is ever marked missing below a library folder that cannot be reached (an unplugged drive, an offline
//! share) or a subfolder that cannot be read: their videos are left exactly as they are.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::Connection;

use super::disk::{DiskFile, DiskScan, outermost, root_of, scan_path, settle_new_files};
use super::identity::identify;
use crate::db::presence::{self, KnownFile};
use crate::db::{Db, folders};
use crate::domain::media::{FileIdentity, display_name};
use crate::domain::paths::is_within;
use crate::error::AppResult;

/// What to change in the library.
#[derive(Debug, Default, PartialEq)]
pub struct Plan {
    /// Missing videos whose file is back where it was.
    pub restore: Vec<i64>,
    /// Videos whose file vanished.
    pub mark_missing: Vec<KnownFile>,
    /// Videos recognized in another file: renamed or moved.
    pub relocate: Vec<(i64, String, FileIdentity)>,
    /// Present videos whose size was never stored (stored before 2.3).
    pub sizes: Vec<(i64, i64)>,
    /// Files that are not in the library.
    pub new_files: Vec<String>,
}

/// Splits what is stored at the scanned paths into present and vanished, and finds the new files.
struct Comparison<'a> {
    present: Vec<(&'a KnownFile, i64)>,
    vanished: Vec<&'a KnownFile>,
    new_files: Vec<&'a DiskFile>,
}

fn compare<'a>(known: &'a [KnownFile], scan: &'a DiskScan) -> Comparison<'a> {
    let on_disk: HashMap<&str, i64> = scan.files.iter().map(|file| (file.path.as_str(), file.size)).collect();
    let stored: HashSet<&str> = known.iter().map(|video| video.path.as_str()).collect();
    let mut comparison = Comparison {
        present: Vec::new(),
        vanished: Vec::new(),
        new_files: scan
            .files
            .iter()
            .filter(|file| !stored.contains(file.path.as_str()))
            .collect(),
    };
    for video in known {
        match on_disk.get(video.path.as_str()) {
            Some(size) => comparison.present.push((video, *size)),
            None if scan
                .unreadable
                .iter()
                .any(|unreadable| is_within(Path::new(&video.path), unreadable)) => {}
            None => comparison.vanished.push(video),
        }
    }
    comparison
}

/// Videos a new file may be: vanished here, or missing anywhere.
fn candidates<'a>(vanished: &[&'a KnownFile], elsewhere: &'a [KnownFile]) -> Vec<&'a KnownFile> {
    let mut seen: HashSet<i64> = vanished.iter().map(|video| video.id).collect();
    let mut candidates = vanished.to_vec();
    candidates.extend(elsewhere.iter().filter(|video| seen.insert(video.id)));
    candidates
}

/// The new files worth identifying: only those with the size of a vanished or missing video can be one of them.
pub fn to_identify(known: &[KnownFile], elsewhere: &[KnownFile], scan: &DiskScan) -> Vec<String> {
    let comparison = compare(known, scan);
    let sizes: HashSet<i64> = candidates(&comparison.vanished, elsewhere)
        .iter()
        .filter_map(|video| video.size)
        .collect();
    comparison
        .new_files
        .iter()
        .filter(|file| sizes.contains(&file.size))
        .map(|file| file.path.clone())
        .collect()
}

/// Decides what changed. A new file takes over a vanished or missing video when it has the same size and
/// fingerprint (or, for a video never fingerprinted, the same file name), and only when the pairing is unambiguous
/// both ways: identical copies are never guessed.
pub fn plan(
    known: &[KnownFile],
    elsewhere: &[KnownFile],
    scan: &DiskScan,
    identities: &HashMap<String, FileIdentity>,
) -> Plan {
    let comparison = compare(known, scan);
    let candidates = candidates(&comparison.vanished, elsewhere);

    let mut pairs: Vec<(&DiskFile, &KnownFile, &FileIdentity)> = Vec::new();
    for file in &comparison.new_files {
        let Some(identity) = identities.get(&file.path) else {
            continue;
        };
        for video in &candidates {
            let same = video.size == Some(file.size)
                && match &video.fingerprint {
                    Some(fingerprint) => *fingerprint == identity.fingerprint,
                    None => display_name(Path::new(&video.path)) == display_name(Path::new(&file.path)),
                };
            if same {
                pairs.push((file, video, identity));
            }
        }
    }
    let count = |matches: &dyn Fn(&(&DiskFile, &KnownFile, &FileIdentity)) -> bool| {
        pairs.iter().filter(|pair| matches(pair)).count()
    };
    let unambiguous: Vec<_> = pairs
        .iter()
        .filter(|(file, video, _)| {
            count(&|(other, _, _)| other.path == file.path) == 1 && count(&|(_, other, _)| other.id == video.id) == 1
        })
        .collect();
    let relocated_files: HashSet<&str> = unambiguous.iter().map(|(file, ..)| file.path.as_str()).collect();
    let relocated_videos: HashSet<i64> = unambiguous.iter().map(|(_, video, _)| video.id).collect();

    Plan {
        restore: comparison
            .present
            .iter()
            .filter(|(video, _)| video.missing)
            .map(|(video, _)| video.id)
            .collect(),
        mark_missing: comparison
            .vanished
            .iter()
            .filter(|video| !video.missing && !relocated_videos.contains(&video.id))
            .map(|video| (*video).clone())
            .collect(),
        relocate: unambiguous
            .iter()
            .map(|(file, video, identity)| (video.id, file.path.clone(), (*identity).clone()))
            .collect(),
        sizes: comparison
            .present
            .iter()
            .filter(|(video, _)| video.size.is_none())
            .map(|(video, size)| (video.id, *size))
            .collect(),
        new_files: comparison
            .new_files
            .iter()
            .filter(|file| !relocated_files.contains(file.path.as_str()))
            .map(|file| file.path.clone())
            .collect(),
    }
}

/// Applies a plan in one transaction. Returns whether any video changed.
pub fn apply(connection: &mut Connection, plan: &Plan) -> AppResult<bool> {
    let transaction = connection.transaction()?;
    for id in &plan.restore {
        presence::restore(&transaction, *id)?;
    }
    for video in &plan.mark_missing {
        presence::mark_missing(&transaction, video.id)?;
    }
    let mut relocated = 0;
    for (id, path, identity) in &plan.relocate {
        if presence::relocate(&transaction, *id, path, identity)? {
            relocated += 1;
        }
    }
    for (id, size) in &plan.sizes {
        presence::set_size(&transaction, *id, *size)?;
    }
    transaction.commit()?;
    Ok(!plan.restore.is_empty() || !plan.mark_missing.is_empty() || relocated > 0)
}

/// What a reconciliation did.
#[derive(Debug, Default)]
pub struct Reconciled {
    /// Some video was restored, marked missing or relocated.
    pub changed: bool,
    /// Files that are not in the library and can be read now.
    pub new_files: Vec<PathBuf>,
    /// New files still being written: check them again later.
    pub deferred: Vec<PathBuf>,
}

/// Reconciles the library with the disk at `paths` (files or folders, existing or not). Paths outside the library or
/// below an unreachable library folder are skipped. New files are given `settle` to show they are not being copied.
pub async fn reconcile(db: &Db, paths: Vec<PathBuf>, settle: Duration) -> AppResult<Reconciled> {
    let library = db.call(|connection| folders::paths(connection)).await?;
    let paths = outermost(
        paths
            .into_iter()
            .filter(|path| root_of(path, &library).is_some())
            .collect(),
    );
    if paths.is_empty() {
        return Ok(Reconciled::default());
    }
    let (paths, mut scan) = {
        let library = library.clone();
        tokio::task::spawn_blocking(move || {
            let reachable: Vec<PathBuf> = paths
                .into_iter()
                .filter(|path| root_of(path, &library).is_some_and(|root| Path::new(root).is_dir()))
                .collect();
            let mut scan = DiskScan::default();
            for path in &reachable {
                scan_path(path, &mut scan);
            }
            (reachable, scan)
        })
        .await?
    };
    let (known, elsewhere) = {
        let paths: Vec<String> = paths.iter().map(|path| path.to_string_lossy().into_owned()).collect();
        db.call(move |connection| {
            let mut seen = HashSet::new();
            let mut known = Vec::new();
            for path in &paths {
                known.extend(
                    presence::known_at(connection, path)?
                        .into_iter()
                        .filter(|video| seen.insert(video.id)),
                );
            }
            Ok((known, presence::missing(connection)?))
        })
        .await?
    };

    let deferred = settle_new_files(&known, &mut scan, settle).await?;
    let wanted = to_identify(&known, &elsewhere, &scan);
    let identities: HashMap<String, FileIdentity> = tokio::task::spawn_blocking(move || {
        wanted
            .into_iter()
            .filter_map(|path| identify(Path::new(&path)).ok().map(|identity| (path, identity)))
            .collect()
    })
    .await?;

    let mut plan = plan(&known, &elsewhere, &scan, &identities);
    // The drive may have gone in the meantime: its videos are not missing, just unreachable.
    let vanished = std::mem::take(&mut plan.mark_missing);
    plan.mark_missing = tokio::task::spawn_blocking(move || {
        vanished
            .into_iter()
            .filter(|video| root_of(Path::new(&video.path), &library).is_some_and(|root| Path::new(root).is_dir()))
            .collect()
    })
    .await?;
    let new_files = plan.new_files.iter().map(PathBuf::from).collect();
    let changed = db.call(move |connection| apply(connection, &plan)).await?;
    Ok(Reconciled {
        changed,
        new_files,
        deferred,
    })
}

#[cfg(test)]
mod tests;
