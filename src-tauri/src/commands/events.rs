//! Events the backend sends on its own, typed for the frontend through the generated bindings.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;
use tauri_specta::Event;

use crate::domain::models::{ProcessingOutcome, ProcessingStatus};
use crate::services::media::processing::{Notification, Notifier};

/// The processing pipeline's status, whenever it changes (at most a few times per second).
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ProcessingStatusChanged(pub ProcessingStatus);

/// A processing job ended: done, cancelled or stopped by an error.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ProcessingFinished(pub ProcessingOutcome);

/// Sends the pipeline's notifications as events to the app's windows.
pub fn processing_notifier(app: AppHandle) -> Notifier {
    Arc::new(move |notification| {
        let sent = match notification {
            Notification::Status(status) => ProcessingStatusChanged(status).emit(&app),
            Notification::Finished(outcome) => ProcessingFinished(outcome).emit(&app),
        };
        if let Err(error) = sent {
            tracing::warn!(%error, "failed to send a processing event");
        }
    })
}
