//! Events the backend sends on its own, typed for the frontend through the generated bindings.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;
use tauri_specta::Event;

use crate::domain::models::{ProcessingOutcome, ProcessingStatus};
use crate::domain::window::WindowMode;
use crate::services::media::processing::{Notification, Notifier};
use crate::services::sync::{SyncNotification, SyncNotifier};

/// The processing pipeline's status, whenever it changes (at most a few times per second).
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ProcessingStatusChanged(pub ProcessingStatus);

/// A processing job ended: done, cancelled or stopped by an error.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ProcessingFinished(pub ProcessingOutcome);

/// Videos or files in the library folders changed on disk: screens showing the library are stale.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct LibraryChanged;

/// A library folder became reachable or unreachable, or the way its changes are followed changed.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct LibraryFoldersChanged;

/// Comparing the library folders with the disk at startup failed, with the reason: changes made while the app was
/// closed are not in the library yet.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct StartupSyncFailed(pub String);

/// The window was pinned or unpinned, or entered or left the mini player (also on its own: maximizing the mini
/// player expands it).
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct WindowModeChanged(pub WindowMode);

/// Sends the folder sync's notifications as events to the app's windows.
pub fn sync_notifier(app: AppHandle) -> SyncNotifier {
    Arc::new(move |notification| {
        let sent = match notification {
            SyncNotification::LibraryChanged => LibraryChanged.emit(&app),
            SyncNotification::FoldersChanged => LibraryFoldersChanged.emit(&app),
            SyncNotification::StartupCompareFailed(reason) => StartupSyncFailed(reason).emit(&app),
        };
        if let Err(error) = sent {
            tracing::warn!(%error, "failed to send a library event");
        }
    })
}

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
