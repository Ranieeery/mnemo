use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use super::*;
use crate::domain::updates::CHECK_INTERVAL_MS;

const NOW: i64 = 1_800_000_000_000;

#[derive(Clone, Copy)]
enum Answer {
    Tag(&'static str),
    Unreachable,
    TimedOut,
}

/// Answers what the test says and counts how often it was asked.
struct FakeSource {
    answer: Mutex<Answer>,
    calls: AtomicUsize,
}

impl FakeSource {
    fn new(answer: Answer) -> Arc<Self> {
        Arc::new(Self {
            answer: Mutex::new(answer),
            calls: AtomicUsize::new(0),
        })
    }

    fn answer(&self, answer: Answer) {
        *self.answer.lock().unwrap() = answer;
    }

    fn calls(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }
}

impl ReleaseSource for FakeSource {
    fn latest_tag(&self) -> AppResult<String> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        match *self.answer.lock().unwrap() {
            Answer::Tag(tag) => Ok(tag.to_owned()),
            Answer::Unreachable => Err(AppError::Network("no connection".into())),
            Answer::TimedOut => Err(AppError::Timeout("Checking for updates".into())),
        }
    }
}

fn checker(db: &Db, source: &Arc<FakeSource>) -> UpdateChecker {
    UpdateChecker::new(db.clone(), source.clone(), Version::new(2, 6, 0))
}

fn available(latest: &str) -> UpdateCheck {
    UpdateCheck::Available {
        running: "2.6.0".into(),
        latest: latest.into(),
    }
}

fn up_to_date() -> UpdateCheck {
    UpdateCheck::UpToDate {
        running: "2.6.0".into(),
    }
}

#[tokio::test]
async fn a_manual_check_reports_what_it_found() {
    let db = Db::open_in_memory().unwrap();
    let source = FakeSource::new(Answer::Tag("v2.7.0"));
    let updates = checker(&db, &source);
    assert_eq!(updates.check_now(NOW).await.unwrap(), available("2.7.0"));

    for tag in ["2.6.0", "2.5.0", "1.0.0"] {
        source.answer(Answer::Tag(tag));
        assert_eq!(updates.check_now(NOW).await.unwrap(), up_to_date(), "{tag}");
    }
}

#[tokio::test]
async fn a_failed_check_is_typed_and_records_nothing() {
    let db = Db::open_in_memory().unwrap();
    let source = FakeSource::new(Answer::Unreachable);
    let updates = checker(&db, &source);
    assert!(matches!(updates.check_now(NOW).await, Err(AppError::Network(_))));

    source.answer(Answer::TimedOut);
    assert!(matches!(updates.check_now(NOW).await, Err(AppError::Timeout(_))));

    for tag in ["latest", "2.8.0-beta.1", "../2.8.0", ""] {
        source.answer(Answer::Tag(tag));
        assert!(
            matches!(updates.check_now(NOW).await, Err(AppError::InvalidResponse(_))),
            "{tag:?}"
        );
    }

    let status = updates.status().await.unwrap();
    assert_eq!(status.last_checked_ms, None);
    assert_eq!(status.available, None);
}

#[tokio::test]
async fn the_startup_check_never_asks_when_turned_off() {
    let db = Db::open_in_memory().unwrap();
    let source = FakeSource::new(Answer::Tag("2.7.0"));
    let updates = checker(&db, &source);
    assert!(!updates.set_automatic(false).await.unwrap().automatic);

    assert_eq!(updates.check_at_startup(NOW).await, None);
    assert_eq!(source.calls(), 0);

    // Checking by hand still works.
    assert_eq!(updates.check_now(NOW).await.unwrap(), available("2.7.0"));
    assert_eq!(source.calls(), 1);
}

#[tokio::test]
async fn the_startup_check_runs_once_a_day_counting_only_successful_checks() {
    let db = Db::open_in_memory().unwrap();
    let source = FakeSource::new(Answer::Unreachable);
    let updates = checker(&db, &source);

    // Offline: nothing recorded, so the next start tries again.
    assert_eq!(updates.check_at_startup(NOW).await, None);
    assert_eq!(updates.status().await.unwrap().last_checked_ms, None);
    source.answer(Answer::Tag("2.6.0"));
    assert_eq!(updates.check_at_startup(NOW + 1000).await, None);
    assert_eq!(source.calls(), 2);
    assert_eq!(updates.status().await.unwrap().last_checked_ms, Some(NOW + 1000));

    // Within a day of the successful check: no request.
    assert_eq!(updates.check_at_startup(NOW + CHECK_INTERVAL_MS).await, None);
    assert_eq!(source.calls(), 2);

    // A day later it asks again.
    source.answer(Answer::Tag("2.7.0"));
    assert_eq!(
        updates
            .check_at_startup(NOW + 1000 + CHECK_INTERVAL_MS)
            .await
            .as_deref(),
        Some("2.7.0")
    );
    assert_eq!(source.calls(), 3);
}

#[tokio::test]
async fn each_version_is_announced_once_even_after_a_restart() {
    let db = Db::open_in_memory().unwrap();
    let source = FakeSource::new(Answer::Tag("2.7.0"));
    assert_eq!(
        checker(&db, &source).check_at_startup(NOW).await.as_deref(),
        Some("2.7.0")
    );

    // A new start (a new checker on the same database), a day later: same version, no announcement.
    let later = NOW + CHECK_INTERVAL_MS;
    assert_eq!(checker(&db, &source).check_at_startup(later).await, None);
    assert_eq!(source.calls(), 2);

    // The same release tagged with a `v` is still the same version.
    source.answer(Answer::Tag("v2.7.0"));
    assert_eq!(checker(&db, &source).check_at_startup(later * 2).await, None);

    source.answer(Answer::Tag("2.8.0"));
    assert_eq!(
        checker(&db, &source).check_at_startup(later * 3).await.as_deref(),
        Some("2.8.0")
    );
}

#[tokio::test]
async fn a_version_seen_in_settings_is_not_announced_again() {
    let db = Db::open_in_memory().unwrap();
    let source = FakeSource::new(Answer::Tag("2.7.0"));
    let updates = checker(&db, &source);
    assert_eq!(updates.check_now(NOW).await.unwrap(), available("2.7.0"));
    assert_eq!(updates.check_at_startup(NOW + CHECK_INTERVAL_MS).await, None);
}

#[tokio::test]
async fn the_status_keeps_the_newer_version_until_the_app_is_updated() {
    let db = Db::open_in_memory().unwrap();
    let source = FakeSource::new(Answer::Tag("2.7.0"));
    checker(&db, &source).check_now(NOW).await.unwrap();

    let status = checker(&db, &source).status().await.unwrap();
    assert_eq!(
        status,
        UpdateStatus {
            automatic: true,
            last_checked_ms: Some(NOW),
            running: "2.6.0".into(),
            available: Some("2.7.0".into()),
        }
    );
    assert_eq!(
        checker(&db, &source).release_page_url().await.unwrap(),
        "https://github.com/Ranieeery/mnemo/releases/tag/2.7.0"
    );

    // Running 2.7.0 now: nothing is available, and there is no page to open.
    let updated = UpdateChecker::new(db.clone(), source.clone(), Version::new(2, 7, 0));
    assert_eq!(updated.status().await.unwrap().available, None);
    assert!(matches!(updated.release_page_url().await, Err(AppError::NotFound(_))));
}

#[tokio::test]
async fn a_release_taken_down_is_no_longer_offered() {
    let db = Db::open_in_memory().unwrap();
    let source = FakeSource::new(Answer::Tag("2.8.0"));
    let updates = checker(&db, &source);
    updates.check_now(NOW).await.unwrap();
    assert_eq!(updates.status().await.unwrap().available.as_deref(), Some("2.8.0"));

    // 2.8.0 was deleted: the latest release is the running version again.
    source.answer(Answer::Tag("2.6.0"));
    assert_eq!(updates.check_now(NOW + 1000).await.unwrap(), up_to_date());
    assert_eq!(updates.status().await.unwrap().available, None);
    assert!(matches!(updates.release_page_url().await, Err(AppError::NotFound(_))));

    // Published again, it is news again.
    source.answer(Answer::Tag("2.8.0"));
    assert_eq!(
        updates
            .check_at_startup(NOW + 1000 + CHECK_INTERVAL_MS)
            .await
            .as_deref(),
        Some("2.8.0")
    );
}

#[tokio::test]
async fn there_is_no_release_page_before_a_newer_version_is_found() {
    let db = Db::open_in_memory().unwrap();
    let source = FakeSource::new(Answer::Tag("2.6.0"));
    let updates = checker(&db, &source);
    updates.check_now(NOW).await.unwrap();
    assert!(matches!(updates.release_page_url().await, Err(AppError::NotFound(_))));
}
