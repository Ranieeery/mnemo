//! Tells whether a newer Mnemo is published on GitHub. Notify only: nothing is ever downloaded or installed. This is
//! the app's only outbound request, and the `check_for_updates` setting turns off the automatic one.

mod github;

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use semver::Version;

use crate::db::Db;
use crate::db::settings::{self, CheckForUpdates, LastUpdateCheck, NotifiedUpdateVersion};
use crate::domain::updates::{ReleaseTag, UpdateCheck, UpdateStatus, is_check_due};
use crate::error::{AppError, AppResult};
use github::GitHubReleases;

/// The automatic check waits this long after startup, so it never delays opening the library.
const STARTUP_DELAY: Duration = Duration::from_secs(10);

/// Where the latest published release is learned. Abstracted so the checks can be tested without the network.
pub trait ReleaseSource: Send + Sync {
    /// The latest release's tag as the source gives it: untrusted, validated by the caller. Blocking.
    fn latest_tag(&self) -> AppResult<String>;
}

/// GitHub, unless a debug build is told to pretend (see [`FakeLatestRelease`]).
pub fn release_source(running: &Version) -> Arc<dyn ReleaseSource> {
    #[cfg(debug_assertions)]
    if let Ok(tag) = std::env::var(FakeLatestRelease::VARIABLE) {
        tracing::warn!(%tag, "update checks use {} instead of GitHub", FakeLatestRelease::VARIABLE);
        return Arc::new(FakeLatestRelease(tag));
    }
    Arc::new(GitHubReleases::new(running))
}

/// Development only, never compiled into release builds: `MNEMO_FAKE_LATEST_RELEASE=2.99.0` stands in for GitHub,
/// and `fail` makes every check fail, so the notice can be tried without publishing a release.
#[cfg(debug_assertions)]
struct FakeLatestRelease(String);

#[cfg(debug_assertions)]
impl FakeLatestRelease {
    const VARIABLE: &'static str = "MNEMO_FAKE_LATEST_RELEASE";
}

#[cfg(debug_assertions)]
impl ReleaseSource for FakeLatestRelease {
    fn latest_tag(&self) -> AppResult<String> {
        if self.0 == "fail" {
            return Err(AppError::Network(format!("{} asked for a failure", Self::VARIABLE)));
        }
        Ok(self.0.clone())
    }
}

/// Unix time in milliseconds, as the check times are stored.
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|elapsed| i64::try_from(elapsed.as_millis()).ok())
        .unwrap_or_default()
}

/// What a check that got an answer found.
struct Found {
    check: UpdateCheck,
    /// A newer version not announced before.
    first_notice: bool,
}

#[derive(Clone)]
pub struct UpdateChecker {
    db: Db,
    source: Arc<dyn ReleaseSource>,
    running: Version,
}

impl UpdateChecker {
    pub fn new(db: Db, source: Arc<dyn ReleaseSource>, running: Version) -> Self {
        Self { db, source, running }
    }

    pub async fn status(&self) -> AppResult<UpdateStatus> {
        let running = self.running.clone();
        self.db
            .call(move |connection| {
                Ok(UpdateStatus {
                    automatic: settings::get::<CheckForUpdates>(connection)?,
                    last_checked_ms: settings::get::<LastUpdateCheck>(connection)?,
                    available: available(settings::get::<NotifiedUpdateVersion>(connection)?, &running)
                        .map(|tag| tag.version().to_string()),
                    running: running.to_string(),
                })
            })
            .await
    }

    pub async fn set_automatic(&self, enabled: bool) -> AppResult<UpdateStatus> {
        self.db
            .call(move |connection| settings::set::<CheckForUpdates>(connection, enabled))
            .await?;
        self.status().await
    }

    /// Asked for in Settings: always asks the source, even with automatic checks off.
    pub async fn check_now(&self, now_ms: i64) -> AppResult<UpdateCheck> {
        Ok(self.fetch(now_ms).await?.check)
    }

    /// The automatic check: only when turned on and a day after the last successful one. Gives the version to
    /// announce when it was not announced before. Failures are only logged: nobody asked for this check.
    pub async fn check_at_startup(&self, now_ms: i64) -> Option<String> {
        let due = self
            .db
            .call(move |connection| {
                Ok(settings::get::<CheckForUpdates>(connection)?
                    && is_check_due(settings::get::<LastUpdateCheck>(connection)?, now_ms))
            })
            .await;
        match due {
            Ok(true) => {}
            Ok(false) => return None,
            Err(error) => {
                tracing::warn!(%error, "could not read the update settings");
                return None;
            }
        }
        match self.fetch(now_ms).await {
            Ok(Found {
                check: UpdateCheck::Available { latest, .. },
                first_notice: true,
            }) => Some(latest),
            Ok(_) => None,
            Err(error) => {
                tracing::warn!(%error, "the automatic update check failed");
                None
            }
        }
    }

    /// Waits [`STARTUP_DELAY`], then runs [`Self::check_at_startup`]; `announce` gets a newly found version.
    pub async fn check_after_startup(self, announce: impl FnOnce(String) + Send + 'static) {
        tokio::time::sleep(STARTUP_DELAY).await;
        if let Some(latest) = self.check_at_startup(now_ms()).await {
            announce(latest);
        }
    }

    /// Opens the page of the newer release found by the last checks in the default browser.
    pub async fn open_release_page(&self) -> AppResult<()> {
        let url = self.release_page_url().await?;
        tauri_plugin_opener::open_url(url, None::<&str>).map_err(|error| AppError::Internal(error.to_string()))
    }

    async fn release_page_url(&self) -> AppResult<String> {
        let running = self.running.clone();
        let notified = self
            .db
            .call(|connection| settings::get::<NotifiedUpdateVersion>(connection))
            .await?;
        available(notified, &running)
            .map(|tag| tag.page_url())
            .ok_or_else(|| AppError::NotFound("a newer release".into()))
    }

    /// Asks the source and, with a valid answer, records when (only then: a failed check is retried at the next
    /// start) and which newer version was found, so it is announced once.
    async fn fetch(&self, now_ms: i64) -> AppResult<Found> {
        let source = Arc::clone(&self.source);
        let tag = tokio::task::spawn_blocking(move || source.latest_tag()).await??;
        let tag = ReleaseTag::parse(&tag)
            .ok_or_else(|| AppError::InvalidResponse("the latest release is not tagged with a version".into()))?;
        let running = self.running.clone();
        self.db
            .call(move |connection| {
                let transaction = connection.transaction()?;
                settings::set::<LastUpdateCheck>(&transaction, Some(now_ms))?;
                let found = if tag.is_newer_than(&running) {
                    let announced = settings::get::<NotifiedUpdateVersion>(&transaction)?
                        .and_then(|announced| ReleaseTag::parse(&announced));
                    settings::set::<NotifiedUpdateVersion>(&transaction, Some(tag.as_str().to_owned()))?;
                    Found {
                        first_notice: announced.is_none_or(|announced| announced.version() != tag.version()),
                        check: UpdateCheck::Available {
                            running: running.to_string(),
                            latest: tag.version().to_string(),
                        },
                    }
                } else {
                    // A newer release found before may have been taken down: stop offering it.
                    settings::set::<NotifiedUpdateVersion>(&transaction, None)?;
                    Found {
                        first_notice: false,
                        check: UpdateCheck::UpToDate {
                            running: running.to_string(),
                        },
                    }
                };
                transaction.commit()?;
                Ok(found)
            })
            .await
    }
}

/// The announced release, while it is still newer than the running app.
fn available(notified: Option<String>, running: &Version) -> Option<ReleaseTag> {
    notified
        .and_then(|tag| ReleaseTag::parse(&tag))
        .filter(|tag| tag.is_newer_than(running))
}

#[cfg(test)]
mod tests;
