//! Runtime scope of the asset protocol, which serves videos and thumbnails to the webview. Only the library folders
//! and the thumbnails directory are readable. Tauri can only widen a scope (`forbid` would also block re-adding the
//! folder later in the session), so removed folders stop being served on the next start.

use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::error::AppResult;

pub fn allow(app: &AppHandle, directory: impl AsRef<Path>) -> AppResult<()> {
    app.asset_protocol_scope().allow_directory(directory, true)?;
    Ok(())
}

pub fn allow_all<I, P>(app: &AppHandle, directories: I) -> AppResult<()>
where
    I: IntoIterator<Item = P>,
    P: AsRef<Path>,
{
    directories.into_iter().try_for_each(|directory| allow(app, directory))
}

/// Serves folders that just joined the library. The change that added them is already saved, so a failure is logged
/// rather than returned (retrying would fail as "already in the library"); every library folder is allowed again at
/// the next start.
pub fn allow_added<I, P>(app: &AppHandle, directories: I)
where
    I: IntoIterator<Item = P>,
    P: AsRef<Path>,
{
    if let Err(error) = allow_all(app, directories) {
        tracing::warn!(%error, "could not serve library folders until the next start");
    }
}
