//! The queue's bookkeeping: handing files to workers, settling them, cancelling jobs and collecting finished ones.

use std::collections::VecDeque;

use super::{Inner, Job, State, Task};
use crate::domain::models::{FileError, ProcessingOutcome};
use crate::services::media::MediaToolkit;

/// Failures kept for the details view; older ones are dropped.
const MAX_ERRORS: usize = 50;

impl<T: MediaToolkit + 'static> Inner<T> {
    /// The next file to read: from the highest priority job, oldest first.
    pub(super) fn take_next(&self) -> Option<Task> {
        let mut state = self.lock();
        let job = state
            .jobs
            .iter_mut()
            .filter(|job| !job.pending.is_empty())
            .min_by_key(|job| (job.priority, job.id))?;
        let file = job.pending.pop_front()?;
        job.reading.push(file.to_string_lossy().into_owned());
        job.outstanding += 1;
        Some(Task {
            job_id: job.id,
            file,
            cancel: job.cancel.clone(),
        })
    }

    /// Settles files that are done with, whatever happened to them: they free their claim, and their job finishes
    /// once nothing else is left. `update` records what happened in the job.
    pub(super) fn settle(
        &self,
        job_id: u64,
        files: &[String],
        update: impl FnOnce(&mut Job, &mut VecDeque<FileError>),
    ) {
        let finished = {
            let mut state = self.lock();
            let State {
                jobs, claimed, errors, ..
            } = &mut *state;
            for file in files {
                claimed.remove(file);
            }
            if let Some(job) = jobs.iter_mut().find(|job| job.id == job_id) {
                job.reading.retain(|reading| !files.contains(reading));
                job.outstanding = job.outstanding.saturating_sub(files.len());
                update(job, errors);
            }
            while errors.len() > MAX_ERRORS {
                errors.pop_front();
            }
            take_finished(&mut state)
        };
        self.report(finished);
    }

    pub(super) fn cancel_where(&self, matches: impl Fn(&Job) -> bool, removed: bool) {
        let finished = {
            let mut state = self.lock();
            let State { jobs, claimed, .. } = &mut *state;
            for job in jobs.iter_mut().filter(|job| matches(job)) {
                job.cancel.cancel();
                job.removed |= removed;
                for file in job.pending.drain(..) {
                    claimed.remove(file.to_string_lossy().as_ref());
                }
            }
            take_finished(&mut state)
        };
        self.report(finished);
    }
}

/// Removes finished jobs and returns how they ended.
pub(super) fn take_finished(state: &mut State) -> Vec<ProcessingOutcome> {
    let mut finished = Vec::new();
    state.jobs.retain(|job| {
        if job.is_finished() {
            finished.push(job.outcome());
            false
        } else {
            true
        }
    });
    finished
}
