//! A worker: takes the next queued file, reads its duration and thumbnail, and hands the result to the writer.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use super::writer::Read;
use super::{FileError, Inner, Task};
use crate::domain::media::title_from_path;
use crate::error::{AppError, AppResult};
use crate::services::media::{MediaToolkit, thumbnails};

pub(super) async fn run<T: MediaToolkit + 'static>(inner: Arc<Inner<T>>) {
    loop {
        // Registered before looking at the queue, so files queued meanwhile are not missed.
        let notified = inner.work.notified();
        tokio::pin!(notified);
        notified.as_mut().enable();
        let Some(task) = inner.take_next() else {
            notified.await;
            continue;
        };
        inner.status_changed.notify_one();
        let result = read(&inner.toolkit, &inner.thumbnails_dir, &task).await;
        finish(&inner, task, result);
    }
}

fn finish<T: MediaToolkit + 'static>(inner: &Arc<Inner<T>>, task: Task, result: AppResult<Read>) {
    let file = task.file.to_string_lossy().into_owned();
    match result {
        Ok(read) => {
            // The writer settles the file once it is stored.
            let sent = inner.writer.get().is_some_and(|writer| writer.send(read).is_ok());
            if sent {
                let mut state = inner.lock();
                if let Some(job) = state.jobs.iter_mut().find(|job| job.id == task.job_id) {
                    job.reading.retain(|reading| *reading != file);
                }
            } else {
                inner.settle(task.job_id, &[file], |job, _| {
                    job.done += 1;
                    job.summary.failed += 1;
                });
            }
        }
        Err(AppError::Cancelled) => inner.settle(task.job_id, &[file], |_, _| {}),
        Err(AppError::MediaToolMissing { .. }) => {
            // Every other file would fail the same way: stop everything once and let the app explain.
            {
                let mut state = inner.lock();
                for job in &mut state.jobs {
                    job.missing_tool = true;
                }
            }
            inner.settle(task.job_id, &[file], |_, _| {});
            cancel_all(inner);
        }
        Err(error) => {
            tracing::warn!(file = %task.file.display(), %error, "failed to read video");
            let message = error.to_string();
            let path = file.clone();
            inner.settle(task.job_id, &[file], |job, errors| {
                job.done += 1;
                job.summary.failed += 1;
                errors.push_back(FileError { path, message });
            });
        }
    }
}

fn cancel_all<T: MediaToolkit + 'static>(inner: &Arc<Inner<T>>) {
    inner.cancel_where(|_| true, false);
}

/// Reads one video. A thumbnail that fails is not fatal (the card shows a placeholder); a cancelled or partial one is
/// deleted.
async fn read<T: MediaToolkit>(toolkit: &T, thumbnails_dir: &Path, task: &Task) -> AppResult<Read> {
    let (file, cancel) = (task.file.as_path(), &task.cancel);
    let duration = toolkit.probe(file, cancel).await?;
    let output = thumbnails::file_for(thumbnails_dir, file);
    let thumbnail = match toolkit
        .thumbnail(file, &output, thumbnails::capture_time(duration), cancel)
        .await
    {
        Ok(()) => Some(output),
        Err(error @ (AppError::Cancelled | AppError::MediaToolMissing { .. })) => {
            discard(thumbnails_dir, output).await;
            return Err(error);
        }
        Err(error) => {
            tracing::warn!(file = %file.display(), %error, "failed to generate thumbnail");
            discard(thumbnails_dir, output).await;
            None
        }
    };
    Ok(Read {
        job_id: task.job_id,
        file_path: file.to_string_lossy().into_owned(),
        title: title_from_path(file),
        duration_seconds: duration,
        thumbnail_path: thumbnail.map(|path| path.to_string_lossy().into_owned()),
    })
}

/// Deletes a thumbnail file that will not be used, off the async runtime.
pub(super) async fn discard(thumbnails_dir: &Path, file: PathBuf) {
    let thumbnails_dir = thumbnails_dir.to_path_buf();
    let files = vec![file.to_string_lossy().into_owned()];
    if let Err(error) = tokio::task::spawn_blocking(move || thumbnails::delete(&thumbnails_dir, &files)).await {
        tracing::warn!(%error, "failed to delete thumbnail");
    }
}
