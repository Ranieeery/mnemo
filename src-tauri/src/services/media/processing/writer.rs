//! The single writer: stores what the workers read in batches, one transaction each.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio::time::Instant;

use super::{FileError, Inner, worker};
use crate::db::folders;
use crate::db::videos::{self, NewVideo};
use crate::domain::media::FileIdentity;
use crate::services::library::ensure_in_library;
use crate::services::media::MediaToolkit;

/// A batch is stored when it holds this many videos, or when the oldest has waited this long.
const BATCH_SIZE: usize = 25;
const BATCH_WAIT: Duration = Duration::from_secs(1);

/// A video read by a worker, waiting to be stored.
pub(super) struct Read {
    pub job_id: u64,
    pub file_path: String,
    pub title: String,
    pub duration_seconds: f64,
    pub thumbnail_path: Option<String>,
    pub identity: Option<FileIdentity>,
}

pub(super) async fn run<T: MediaToolkit + 'static>(inner: Arc<Inner<T>>, mut receiver: mpsc::UnboundedReceiver<Read>) {
    while let Some(first) = receiver.recv().await {
        let deadline = Instant::now() + BATCH_WAIT;
        let mut batch = vec![first];
        while batch.len() < BATCH_SIZE {
            match tokio::time::timeout_at(deadline, receiver.recv()).await {
                Ok(Some(read)) => batch.push(read),
                Ok(None) | Err(_) => break,
            }
        }
        store(&inner, batch).await;
    }
}

/// Stores a batch and settles its files. Videos stored meanwhile by another job keep their record, and the thumbnail
/// read again for them is deleted.
async fn store<T: MediaToolkit + 'static>(inner: &Arc<Inner<T>>, batch: Vec<Read>) {
    type Row = (String, String, f64, Option<String>, Option<FileIdentity>);
    let rows: Vec<Row> = batch
        .iter()
        .map(|read| {
            (
                read.file_path.clone(),
                read.title.clone(),
                read.duration_seconds,
                read.thumbnail_path.clone(),
                read.identity.clone(),
            )
        })
        .collect();
    let stored = inner
        .db
        .call(move |connection| {
            // A folder removed from the library while its videos were being read must not get them back.
            let library = folders::paths(connection)?;
            let inside: Vec<bool> = rows
                .iter()
                .map(|(file_path, ..)| ensure_in_library(Path::new(file_path), &library).is_ok())
                .collect();
            let videos: Vec<NewVideo> = rows
                .iter()
                .zip(&inside)
                .filter(|(_, inside)| **inside)
                .map(
                    |((file_path, title, duration_seconds, thumbnail_path, identity), _)| NewVideo {
                        file_path,
                        title,
                        duration_seconds: *duration_seconds,
                        thumbnail_path: thumbnail_path.as_deref(),
                        identity: identity.as_ref(),
                    },
                )
                .collect();
            let mut inserted = videos::insert_batch(connection, &videos)?.into_iter();
            // Per read video: stored (`Some(true)`), already there (`Some(false)`) or outside the library (`None`).
            Ok(inside
                .into_iter()
                .map(|inside| if inside { inserted.next() } else { None })
                .collect::<Vec<_>>())
        })
        .await;

    match stored {
        Ok(results) => {
            for (read, result) in batch.into_iter().zip(results) {
                if result != Some(true) {
                    discard_thumbnail(&inner.thumbnails_dir, read.thumbnail_path.as_deref()).await;
                }
                inner.settle(read.job_id, &[read.file_path], |job, _| {
                    job.done += 1;
                    match result {
                        Some(true) => job.summary.processed += 1,
                        Some(false) => job.summary.skipped += 1,
                        None => {}
                    }
                });
            }
        }
        Err(error) => {
            tracing::warn!(%error, "failed to store processed videos");
            let message = error.to_string();
            for read in batch {
                discard_thumbnail(&inner.thumbnails_dir, read.thumbnail_path.as_deref()).await;
                let path = read.file_path.clone();
                let message = message.clone();
                inner.settle(read.job_id, &[read.file_path], |job, errors| {
                    job.done += 1;
                    job.summary.failed += 1;
                    errors.push_back(FileError { path, message });
                });
            }
        }
    }
}

async fn discard_thumbnail(thumbnails_dir: &Path, thumbnail: Option<&str>) {
    if let Some(thumbnail) = thumbnail {
        worker::discard(thumbnails_dir, PathBuf::from(thumbnail)).await;
    }
}
