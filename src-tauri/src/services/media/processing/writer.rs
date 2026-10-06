//! The single writer: stores what the workers read in batches, one transaction each.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio::time::Instant;

use super::{FileError, Inner, worker};
use crate::db::videos::{self, NewVideo};
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
    let rows: Vec<(String, String, f64, Option<String>)> = batch
        .iter()
        .map(|read| {
            (
                read.file_path.clone(),
                read.title.clone(),
                read.duration_seconds,
                read.thumbnail_path.clone(),
            )
        })
        .collect();
    let stored = inner
        .db
        .call(move |connection| {
            let videos: Vec<NewVideo> = rows
                .iter()
                .map(|(file_path, title, duration_seconds, thumbnail_path)| NewVideo {
                    file_path,
                    title,
                    duration_seconds: *duration_seconds,
                    thumbnail_path: thumbnail_path.as_deref(),
                })
                .collect();
            videos::insert_batch(connection, &videos)
        })
        .await;

    match stored {
        Ok(inserted) => {
            for (read, new) in batch.into_iter().zip(inserted) {
                if !new {
                    discard_thumbnail(&inner.thumbnails_dir, read.thumbnail_path.as_deref()).await;
                }
                inner.settle(read.job_id, &[read.file_path], |job, _| {
                    job.done += 1;
                    if new {
                        job.summary.processed += 1;
                    } else {
                        job.summary.skipped += 1;
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
