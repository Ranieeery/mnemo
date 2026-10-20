//! Locating a library folder that was moved or renamed outside the app, or whose drive got another letter or mount
//! point. Files are never moved: only the stored paths change, so every video keeps its record (progress, tags,
//! history, title, thumbnail) and the folder keeps its icon and view modes. Applying runs in the sync loop (see
//! `services::sync`), which then compares the folder with the disk like "Sync folder" does.

use std::path::{Path, PathBuf};

use crate::db::presence::KnownFile;
use crate::db::{Db, folders, hidden, presence};
use crate::domain::media::display_name;
use crate::domain::models::LibraryFolder;
use crate::domain::paths::is_within;
use crate::domain::relocation::{RelocationCheck, RelocationResult, classify, relocated};
use crate::error::{AppError, AppResult};

/// Checks that `to` can become the location of the library folder `from`. Returns the videos stored for `from`.
async fn validate(db: &Db, from: &str, to: &str) -> AppResult<Vec<KnownFile>> {
    let (library, known) = {
        let from = from.to_owned();
        db.call(move |connection| {
            let library = folders::paths(connection)?;
            if !library.contains(&from) {
                return Err(AppError::NotFound(format!("library folder {from}")));
            }
            Ok((library, presence::known_at(connection, &from)?))
        })
        .await?
    };
    let name = display_name(Path::new(from));
    if Path::new(from) == Path::new(to) {
        return Err(AppError::InvalidInput(format!(
            "This is where {name} already is. If it is connected again, try opening it."
        )));
    }
    let (from_reachable, to_is_dir) = {
        let (from, to) = (PathBuf::from(from), PathBuf::from(to));
        // Checking a drive can block (a sleeping disk, an offline share).
        tokio::task::spawn_blocking(move || (from.is_dir(), to.is_dir())).await?
    };
    if from_reachable {
        return Err(AppError::InvalidInput(format!(
            "{name} is connected again, so there is nothing to locate."
        )));
    }
    if !to_is_dir {
        return Err(AppError::InvalidInput(format!(
            "{to} is not a folder that can be read."
        )));
    }
    // The folder and the library folders inside it move together, so only the others can be in the way.
    let others = library
        .iter()
        .map(PathBuf::from)
        .filter(|folder| !is_within(folder, Path::new(from)));
    for other in others {
        if Path::new(to) == other {
            return Err(AppError::InvalidInput(format!("{to} is already a library folder.")));
        }
        if is_within(Path::new(to), &other) {
            return Err(AppError::InvalidInput(format!(
                "{to} is inside the library folder {}.",
                other.display()
            )));
        }
        if is_within(&other, Path::new(to)) {
            return Err(AppError::InvalidInput(format!(
                "{to} contains the library folder {}.",
                other.display()
            )));
        }
    }
    Ok(known)
}

/// Compares the videos stored for `from` with the files at `to`, without changing anything.
pub async fn check(db: &Db, from: String, to: String) -> AppResult<RelocationCheck> {
    let known = validate(db, &from, &to).await?;
    let (source, target) = (PathBuf::from(&from), PathBuf::from(&to));
    // Only file metadata is read, so large folders are compared quickly; renamed files are recognized later by the
    // comparison that follows a relocation.
    let total = known.len() as i64;
    let (found, different) = tokio::task::spawn_blocking(move || {
        let mut found = 0;
        let mut different = 0;
        for video in &known {
            let Some(candidate) = relocated(Path::new(&video.path), &source, &target) else {
                continue;
            };
            if let Ok(metadata) = std::fs::metadata(&candidate)
                && metadata.is_file()
            {
                if video
                    .size
                    .is_some_and(|size| u64::try_from(size).ok() != Some(metadata.len()))
                {
                    different += 1;
                } else {
                    found += 1;
                }
            }
        }
        (found, different)
    })
    .await?;
    Ok(RelocationCheck {
        from,
        to,
        total_videos: total,
        found_videos: found,
        different_videos: different,
        quality: classify(total, found),
    })
}

/// Points the library folder `from` (and the library folders inside it) at `to`, in one transaction: the folders,
/// their videos, their view modes and their hidden folders. Records already stored in `to` at a path a video takes
/// are deleted; their thumbnails are returned for the caller to delete. Validated again, since things may have
/// changed meanwhile.
pub async fn apply(db: &Db, from: String, to: String) -> AppResult<Vec<String>> {
    validate(db, &from, &to).await?;
    db.call(move |connection| {
        let transaction = connection.transaction()?;
        let removed = presence::clear_move_target(&transaction, &from, &to)?;
        presence::move_folder(&transaction, &from, &to)?;
        folders::move_view_modes(&transaction, &from, &to)?;
        hidden::move_within(&transaction, &from, &to)?;
        folders::relocate(&transaction, &from, &to)?;
        transaction.commit()?;
        Ok(removed)
    })
    .await
}

/// The library folder at `to` and how many of its videos are there, once compared with the disk.
pub async fn summary(db: &Db, to: String) -> AppResult<RelocationResult> {
    db.call(move |connection| {
        let folder: LibraryFolder =
            folders::find(connection, &to)?.ok_or_else(|| AppError::NotFound(format!("library folder {to}")))?;
        let known = presence::known_at(connection, &to)?;
        Ok(RelocationResult {
            folder,
            total_videos: known.len() as i64,
            found_videos: known.iter().filter(|video| !video.missing).count() as i64,
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::videos::{self, NewVideo};
    use crate::db::{history, tags};
    use crate::domain::media::FileIdentity;
    use crate::domain::relocation::RelocationMatch;

    /// A library folder `Gone` that is no longer on disk, with stored videos, and a folder `Moved` holding some of
    /// its files.
    struct Fixture {
        db: Db,
        dir: tempfile::TempDir,
    }

    impl Fixture {
        async fn new() -> Self {
            let fixture = Self {
                db: Db::open_in_memory().unwrap(),
                dir: tempfile::tempdir().unwrap(),
            };
            let gone = fixture.path("Gone");
            fixture
                .db
                .call(move |connection| folders::add(connection, &gone))
                .await
                .unwrap();
            fixture
        }

        fn path(&self, relative: &str) -> String {
            relative
                .split('/')
                .fold(self.dir.path().to_path_buf(), |path, part| path.join(part))
                .to_string_lossy()
                .into_owned()
        }

        fn write(&self, relative: &str, content: &[u8]) {
            let path = PathBuf::from(self.path(relative));
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, content).unwrap();
        }

        /// Stores a video with a tag, a history entry and, when given, the size of its file.
        async fn store(&self, relative: &str, size: Option<i64>) -> i64 {
            let path = self.path(relative);
            self.db
                .call(move |connection| {
                    let identity = size.map(|size| FileIdentity {
                        size,
                        fingerprint: "f".into(),
                    });
                    let video = videos::insert(
                        connection,
                        &NewVideo {
                            file_path: &path,
                            title: "Kept title",
                            duration_seconds: 60.0,
                            thumbnail_path: Some("thumb.jpg"),
                            identity: identity.as_ref(),
                        },
                    )?;
                    let tag = tags::find_or_create(connection, "favorite")?;
                    tags::add_to_video(connection, video.id, tag.id)?;
                    history::record(connection, video.id, 60.0)?;
                    Ok(video.id)
                })
                .await
                .unwrap()
        }
    }

    #[tokio::test]
    async fn counts_the_stored_videos_found_at_the_new_location() {
        let fixture = Fixture::new().await;
        fixture.store("Gone/Ep 1.mkv", Some(5)).await;
        fixture.store("Gone/Season 2/Ep 1.mkv", None).await;
        fixture.store("Gone/Resized.mkv", Some(999)).await;
        fixture.store("Gone/Lost.mkv", None).await;
        fixture.write("Moved/Ep 1.mkv", b"12345");
        fixture.write("Moved/Season 2/Ep 1.mkv", b"any size");
        fixture.write("Moved/Resized.mkv", b"short");

        let check = check(&fixture.db, fixture.path("Gone"), fixture.path("Moved"))
            .await
            .unwrap();
        assert_eq!(
            (check.total_videos, check.found_videos, check.different_videos),
            (4, 2, 1)
        );
        assert_eq!(check.quality, RelocationMatch::Partial);
    }

    #[tokio::test]
    async fn refuses_locations_that_cannot_be_the_folder() {
        let fixture = Fixture::new().await;
        let other = fixture.path("Other");
        fixture.write("Other/Inside/a.mkv", b"a");
        fixture
            .db
            .call(move |connection| folders::add(connection, &other))
            .await
            .unwrap();
        let refused = async |to: &str| {
            matches!(
                check(&fixture.db, fixture.path("Gone"), fixture.path(to)).await,
                Err(AppError::InvalidInput(_))
            )
        };
        assert!(refused("Other").await, "already a library folder");
        assert!(refused("Other/Inside").await, "inside a library folder");
        assert!(refused("").await, "contains a library folder");
        assert!(refused("Nowhere").await, "not a folder");
        assert!(refused("Gone").await, "the same path");

        // The folder is back where it was: there is nothing to locate.
        std::fs::create_dir(fixture.path("Gone")).unwrap();
        fixture.write("Elsewhere/a.mkv", b"a");
        assert!(refused("Elsewhere").await, "reachable again");
        assert!(matches!(
            check(&fixture.db, fixture.path("Unknown"), fixture.path("Elsewhere")).await,
            Err(AppError::NotFound(_))
        ));
    }

    #[tokio::test]
    async fn applying_keeps_every_video_record_and_the_library_folders_inside() {
        let fixture = Fixture::new().await;
        let nested = fixture.path("Gone/Anime");
        let private = fixture.path("Gone/Anime/Private");
        fixture
            .db
            .call(move |connection| {
                folders::add(connection, &nested)?;
                hidden::hide(connection, &private)
            })
            .await
            .unwrap();
        let video = fixture.store("Gone/Anime/Ep 1.mkv", None).await;
        let before = fixture
            .db
            .call(move |connection| videos::get(connection, video))
            .await
            .unwrap();
        // A record from long ago, outside the library, where the video is about to go.
        let stale = fixture.store("Moved/Anime/Ep 1.mkv", None).await;
        fixture.write("Moved/Anime/Ep 1.mkv", b"a");

        let removed = apply(&fixture.db, fixture.path("Gone"), fixture.path("Moved"))
            .await
            .unwrap();
        assert_eq!(removed, ["thumb.jpg"]);
        let moved_path = fixture.path("Moved/Anime/Ep 1.mkv");
        let (after, stale_after, tag_count, library, hidden_folders) = fixture
            .db
            .call(move |connection| {
                Ok((
                    videos::get(connection, video)?,
                    videos::find_by_id(connection, stale)?,
                    tags::for_video(connection, video)?.len(),
                    folders::paths(connection)?,
                    hidden::list(connection)?,
                ))
            })
            .await
            .unwrap();
        assert_eq!(hidden_folders, [fixture.path("Moved/Anime/Private")]);
        assert_eq!(after.file_path, moved_path);
        assert_eq!(
            (after.title, after.thumbnail_path, after.created_at),
            (before.title, before.thumbnail_path, before.created_at)
        );
        assert!(stale_after.is_none());
        assert_eq!(tag_count, 1);
        assert_eq!(library, [fixture.path("Moved"), fixture.path("Moved/Anime")]);

        let summary = summary(&fixture.db, fixture.path("Moved")).await.unwrap();
        assert_eq!((summary.total_videos, summary.found_videos), (1, 1));
        assert_eq!(summary.folder.name, "Moved");
    }
}
