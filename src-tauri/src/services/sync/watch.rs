//! The file system watcher: one recursive watch per available library folder, debounced, turned into changes for the
//! sync loop. Renames are paired so a folder keeps its settings and a file never fingerprinted keeps its record: Linux
//! pairs them itself, Windows reports the old name right before the new one, and on macOS the debouncer pairs them
//! through a cache of file ids, the only platform where that cache (one entry per file) is kept.

use std::path::{Path, PathBuf};
use std::time::Duration;

use notify_debouncer_full::notify::event::{ModifyKind, RenameMode};
use notify_debouncer_full::notify::{self, ErrorKind, Event, EventKind, RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{DebounceEventResult, Debouncer, new_debouncer_opt};

use crate::domain::media::is_video_path;

#[cfg(target_os = "macos")]
type FileIds = notify_debouncer_full::FileIdMap;
#[cfg(not(target_os = "macos"))]
type FileIds = notify_debouncer_full::NoCache;

/// Something that changed below a library folder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Change {
    /// A file or folder was renamed or moved, both paths known.
    Renamed { from: PathBuf, to: PathBuf },
    /// A path was created, removed or rewritten; what it is now is checked on disk.
    Touched(PathBuf),
    /// Events were lost below this path (every library folder when `None`): it must be compared again as a whole.
    Rescan(Option<PathBuf>),
}

/// What the watcher reports.
pub enum Signal {
    Changes(Vec<Change>),
    /// Watching stopped working below these paths; with `limit`, the system watch limit was reached.
    Failed {
        paths: Vec<PathBuf>,
        reason: String,
        limit: bool,
    },
}

pub struct Watcher {
    debouncer: Debouncer<RecommendedWatcher, FileIds>,
}

impl Watcher {
    pub fn new(debounce: Duration, on_signal: impl Fn(Signal) + Send + 'static) -> notify::Result<Self> {
        let debouncer = new_debouncer_opt(
            debounce,
            None,
            move |result: DebounceEventResult| match result {
                Ok(events) => {
                    let changes = changes(events.iter().map(|event| &event.event));
                    if !changes.is_empty() {
                        on_signal(Signal::Changes(changes));
                    }
                }
                Err(errors) => {
                    for error in errors {
                        tracing::warn!(%error, paths = ?error.paths, "folder watcher failed");
                        on_signal(Signal::Failed {
                            limit: matches!(error.kind, ErrorKind::MaxFilesWatch),
                            reason: failure_reason(&error),
                            paths: error.paths,
                        });
                    }
                }
            },
            FileIds::new(),
            notify::Config::default(),
        )?;
        Ok(Self { debouncer })
    }

    /// Starts watching a library folder and everything inside it. On failure, returns why, in words for the user.
    pub fn watch(&mut self, root: &Path) -> Result<(), String> {
        self.debouncer.watch(root, RecursiveMode::Recursive).map_err(|error| {
            tracing::warn!(root = %root.display(), %error, "could not watch library folder");
            // A recursive watch that hit the limit halfway keeps what it added; drop it all.
            self.unwatch(root);
            failure_reason(&error)
        })
    }

    pub fn unwatch(&mut self, root: &Path) {
        // Fails when the folder was never watched or its drive is gone, which is fine.
        let _ = self.debouncer.unwatch(root);
    }
}

fn failure_reason(error: &notify::Error) -> String {
    match error.kind {
        ErrorKind::MaxFilesWatch => {
            "The system limit of watched folders was reached. On Linux, raise fs.inotify.max_user_watches.".to_owned()
        }
        _ => format!("Watching is not supported here: {error}"),
    }
}

/// Turns debounced events into changes. Checks the disk to drop what cannot matter: writes to files that are not
/// videos, and new files that are not videos. Removed paths always count, as they may have been folders.
pub fn changes<'a>(events: impl IntoIterator<Item = &'a Event>) -> Vec<Change> {
    let mut changes = Vec::new();
    let mut events = events.into_iter().peekable();
    while let Some(event) = events.next() {
        if let Some((from, to)) = events.peek().and_then(|next| rename_halves(event, next)) {
            changes.push(Change::Renamed { from, to });
            events.next();
            continue;
        }
        if event.need_rescan() {
            if event.paths.is_empty() {
                changes.push(Change::Rescan(None));
            }
            changes.extend(event.paths.iter().cloned().map(Some).map(Change::Rescan));
            continue;
        }
        match event.kind {
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)) if event.paths.len() == 2 => {
                changes.push(Change::Renamed {
                    from: event.paths[0].clone(),
                    to: event.paths[1].clone(),
                });
            }
            EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_)) | EventKind::Any => {
                changes.extend(
                    event
                        .paths
                        .iter()
                        .filter(|path| may_hold_videos(path))
                        .cloned()
                        .map(Change::Touched),
                );
            }
            EventKind::Modify(_) => {
                changes.extend(
                    event
                        .paths
                        .iter()
                        .filter(|path| is_video_path(path))
                        .cloned()
                        .map(Change::Touched),
                );
            }
            EventKind::Access(_) | EventKind::Other => {}
        }
    }
    changes
}

/// An old name immediately followed by a new name, as Windows reports a rename.
fn rename_halves(event: &Event, next: &Event) -> Option<(PathBuf, PathBuf)> {
    match (event.kind, next.kind, event.paths.as_slice(), next.paths.as_slice()) {
        (
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            [from],
            [to],
        ) => Some((from.clone(), to.clone())),
        _ => None,
    }
}

fn may_hold_videos(path: &Path) -> bool {
    is_video_path(path) || path.is_dir() || !path.exists()
}

#[cfg(test)]
mod tests {
    use notify_debouncer_full::notify::event::{AccessKind, CreateKind, DataChange, Flag, RemoveKind};

    use super::*;

    fn event(kind: EventKind, paths: &[&Path]) -> Event {
        paths
            .iter()
            .fold(Event::new(kind), |event, path| event.add_path(path.to_path_buf()))
    }

    #[test]
    fn keeps_what_can_change_the_library() {
        let dir = tempfile::tempdir().unwrap();
        let video = dir.path().join("Ep 1.mkv");
        let poster = dir.path().join("poster.jpg");
        let folder = dir.path().join("Season 1");
        std::fs::write(&video, b"").unwrap();
        std::fs::write(&poster, b"").unwrap();
        std::fs::create_dir(&folder).unwrap();
        let gone = dir.path().join("Old season");

        let found = changes(&[
            event(EventKind::Create(CreateKind::File), &[&video]),
            event(EventKind::Create(CreateKind::File), &[&poster]),
            event(EventKind::Create(CreateKind::Folder), &[&folder]),
            event(EventKind::Remove(RemoveKind::Any), &[&gone]),
            event(EventKind::Modify(ModifyKind::Data(DataChange::Any)), &[&video]),
            event(EventKind::Modify(ModifyKind::Data(DataChange::Any)), &[&poster]),
            event(EventKind::Access(AccessKind::Any), &[&video]),
        ]);
        assert_eq!(
            found,
            vec![
                Change::Touched(video.clone()),
                Change::Touched(folder),
                Change::Touched(gone),
                Change::Touched(video),
            ]
        );
    }

    #[test]
    fn pairs_renames_and_asks_for_a_rescan_when_events_were_lost() {
        let from = Path::new("D:/Show/Ep 1.mkv");
        let to = Path::new("D:/Show/Pilot.mkv");
        let mut lost = event(EventKind::Any, &[Path::new("D:/Show")]);
        lost.attrs.set_flag(Flag::Rescan);
        let mut lost_everywhere = Event::new(EventKind::Any);
        lost_everywhere.attrs.set_flag(Flag::Rescan);

        let other = Path::new("D:/Show/Ep 2.mkv");
        assert_eq!(
            changes(&[
                event(EventKind::Modify(ModifyKind::Name(RenameMode::From)), &[from]),
                event(EventKind::Modify(ModifyKind::Name(RenameMode::To)), &[to])
            ]),
            vec![Change::Renamed {
                from: from.to_path_buf(),
                to: to.to_path_buf()
            }]
        );
        assert_eq!(
            changes(&[event(EventKind::Modify(ModifyKind::Name(RenameMode::To)), &[other])]),
            vec![Change::Touched(other.to_path_buf())]
        );
        assert_eq!(
            changes(&[
                event(EventKind::Modify(ModifyKind::Name(RenameMode::Both)), &[from, to]),
                lost,
                lost_everywhere,
            ]),
            vec![
                Change::Renamed {
                    from: from.to_path_buf(),
                    to: to.to_path_buf()
                },
                Change::Rescan(Some(PathBuf::from("D:/Show"))),
                Change::Rescan(None),
            ]
        );
    }
}
