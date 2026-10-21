//! A job's first step: queueing the files that are neither stored nor claimed by another job.

use std::path::PathBuf;

use super::{Inner, State, take_finished};
use crate::db::videos;
use crate::error::AppResult;
use crate::services::media::MediaToolkit;
use crate::services::scanner;

impl<T: MediaToolkit + 'static> Inner<T> {
    /// Queues the job's `files` that are neither stored nor claimed by another job.
    pub(super) async fn scan(&self, job_id: u64, files: Vec<PathBuf>) {
        let found = self.new_files(files).await;
        let finished = {
            let mut state = self.lock();
            let State { jobs, claimed, .. } = &mut *state;
            if let Some(job) = jobs.iter_mut().find(|job| job.id == job_id) {
                job.scanning = false;
                match found {
                    Ok(_) if job.cancel.is_cancelled() => {}
                    Ok((files, stored)) => {
                        job.summary.skipped += stored;
                        for file in files {
                            if claimed.insert(file.to_string_lossy().into_owned()) {
                                job.pending.push_back(file);
                            } else {
                                job.summary.skipped += 1;
                            }
                        }
                        job.total = job.pending.len() as i64;
                    }
                    Err(error) => job.error = Some(error.to_string()),
                }
            }
            take_finished(&mut state)
        };
        self.work.notify_waiters();
        self.report(finished);
    }

    /// The `files` that are not in the library yet (stored meanwhile by another job), in natural order, and how many
    /// already are.
    async fn new_files(&self, mut files: Vec<PathBuf>) -> AppResult<(Vec<PathBuf>, i64)> {
        scanner::sort_by_path(&mut files);
        let (stored, files) = self
            .db
            .call(move |connection| videos::split_stored(connection, files))
            .await?;
        Ok((files, stored as i64))
    }
}
