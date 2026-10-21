//! A job's first step: listing the folder's videos and queueing the ones still to read.

use std::collections::HashSet;
use std::path::PathBuf;

use super::{Inner, State, take_finished};
use crate::db::videos;
use crate::error::AppResult;
use crate::services::media::MediaToolkit;
use crate::services::scanner;

impl<T: MediaToolkit + 'static> Inner<T> {
    /// Lists the folder's videos (or takes `files`, when given) and queues the ones neither stored nor claimed by
    /// another job.
    pub(super) async fn scan(&self, job_id: u64, folder: PathBuf, files: Option<Vec<PathBuf>>) {
        let found = self.new_files(folder, files).await;
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

    /// The videos below `folder` (or `files`) that are not in the library yet, in natural order, and how many already
    /// are.
    async fn new_files(&self, folder: PathBuf, files: Option<Vec<PathBuf>>) -> AppResult<(Vec<PathBuf>, i64)> {
        let mut files = match files {
            Some(files) => files,
            None => {
                let root = folder.clone();
                tokio::task::spawn_blocking(move || scanner::walk_videos(&root, |_| false, |_, _| Ok(()))).await??
            }
        };
        scanner::sort_by_path(&mut files);
        let folder_text = folder.to_string_lossy().into_owned();
        let stored: HashSet<String> = self
            .db
            .call(move |connection| videos::in_folder(connection, &folder_text, true))
            .await?
            .into_iter()
            .map(|video| video.file_path)
            .collect();
        let total = files.len();
        files.retain(|file| !stored.contains(file.to_string_lossy().as_ref()));
        let already_stored = (total - files.len()) as i64;
        Ok((files, already_stored))
    }
}
