//! Whether a published Mnemo release is newer than the running app, and where its page is. The request itself lives
//! in `services::updates`; nothing here touches the network.

use semver::Version;
use serde::Serialize;
use specta::Type;

/// The GitHub repository Mnemo is released from.
pub const REPOSITORY_OWNER: &str = "Ranieeery";
pub const REPOSITORY_NAME: &str = "mnemo";

/// An automatic check waits this long after the last successful one.
pub const CHECK_INTERVAL_MS: i64 = 24 * 60 * 60 * 1000;

/// Real tags are like `2.10.0`; anything much longer is not one of ours.
const MAX_TAG_LENGTH: usize = 32;

/// GitHub's latest published release: never a draft or a pre-release.
pub fn latest_release_api_url() -> String {
    format!("https://api.github.com/repos/{REPOSITORY_OWNER}/{REPOSITORY_NAME}/releases/latest")
}

/// A release tag that is a stable version: `X.Y.Z`, with or without a leading `v`. Pre-releases and build metadata
/// are refused, so a tag is never announced ahead of its stable release, and what is left (an optional `v`, digits
/// and dots) is safe to put in a URL.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReleaseTag {
    tag: String,
    version: Version,
}

impl ReleaseTag {
    pub fn parse(tag: &str) -> Option<Self> {
        if tag.len() > MAX_TAG_LENGTH {
            return None;
        }
        let version = Version::parse(tag.strip_prefix('v').unwrap_or(tag)).ok()?;
        if !version.pre.is_empty() || !version.build.is_empty() {
            return None;
        }
        Some(Self {
            tag: tag.to_owned(),
            version,
        })
    }

    /// The tag as published, which is what its page is named after.
    pub fn as_str(&self) -> &str {
        &self.tag
    }

    pub fn version(&self) -> &Version {
        &self.version
    }

    /// Strictly newer than `running`. A running pre-release (`2.7.0-beta.1`) is older than its stable release.
    pub fn is_newer_than(&self, running: &Version) -> bool {
        self.version.cmp_precedence(running).is_gt()
    }

    /// The release's page on GitHub, built from the repository constants and this validated tag only.
    pub fn page_url(&self) -> String {
        format!(
            "https://github.com/{REPOSITORY_OWNER}/{REPOSITORY_NAME}/releases/tag/{}",
            self.tag
        )
    }
}

/// Whether an automatic check is due. A last check in the future (the clock was set back) does not hold it off.
pub fn is_check_due(last_checked_ms: Option<i64>, now_ms: i64) -> bool {
    match last_checked_ms {
        None => true,
        Some(last) => now_ms < last || now_ms - last >= CHECK_INTERVAL_MS,
    }
}

/// What a check found. Versions are written by `semver`, never copied from the response.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum UpdateCheck {
    UpToDate { running: String },
    Available { running: String, latest: String },
}

/// The update settings and what is known without asking GitHub again.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// Checks once a day, about 10 s after Mnemo starts.
    pub automatic: bool,
    /// Unix time in milliseconds of the last check that got an answer.
    pub last_checked_ms: Option<i64>,
    pub running: String,
    /// A newer version found by an earlier check, until the app is updated to it.
    pub available: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn version(text: &str) -> Version {
        Version::parse(text).unwrap()
    }

    #[test]
    fn compares_tags_with_the_running_version() {
        let cases = [
            ("2.10.0", "2.9.0", true),
            ("v2.7.0", "2.6.0", true),
            ("3.0.0", "2.99.99", true),
            ("2.6.1", "2.6.0", true),
            ("2.6.0", "2.6.0", false),
            ("v2.6.0", "2.6.0", false),
            ("2.5.9", "2.6.0", false),
            ("1.0.0", "2.6.0", false),
            // A pre-release build is told about its stable release.
            ("2.7.0", "2.7.0-beta.1", true),
        ];
        for (tag, running, newer) in cases {
            let tag = ReleaseTag::parse(tag).unwrap();
            assert_eq!(
                tag.is_newer_than(&version(running)),
                newer,
                "{} vs {running}",
                tag.as_str()
            );
        }
    }

    #[test]
    fn refuses_tags_that_are_not_a_stable_version() {
        for tag in [
            "",
            "v",
            "2.7",
            "2",
            "latest",
            "V2.7.0",
            "vv2.7.0",
            " 2.7.0",
            "2.7.0 ",
            "02.7.0",
            "2.7.0-beta.1",
            "v2.8.0-rc.1",
            "2.7.0+build.5",
            "../2.7.0",
            "2.7.0/../../evil",
            "2.7.0?x=1",
            "2.7.0#top",
            "99999999999999999999999.0.0",
            "1.2.3.4",
        ] {
            assert_eq!(ReleaseTag::parse(tag), None, "{tag:?}");
        }
        let long = format!("{}.0.0", "1".repeat(40));
        assert_eq!(ReleaseTag::parse(&long), None);
    }

    #[test]
    fn keeps_the_tag_as_published() {
        let tag = ReleaseTag::parse("v2.7.0").unwrap();
        assert_eq!(tag.as_str(), "v2.7.0");
        assert_eq!(tag.version().to_string(), "2.7.0");
    }

    #[test]
    fn builds_the_release_page_from_the_constants_and_the_tag() {
        assert_eq!(
            ReleaseTag::parse("2.7.0").unwrap().page_url(),
            "https://github.com/Ranieeery/mnemo/releases/tag/2.7.0"
        );
        assert_eq!(
            ReleaseTag::parse("v2.7.0").unwrap().page_url(),
            "https://github.com/Ranieeery/mnemo/releases/tag/v2.7.0"
        );
        assert_eq!(
            latest_release_api_url(),
            "https://api.github.com/repos/Ranieeery/mnemo/releases/latest"
        );
    }

    #[test]
    fn a_check_is_due_once_a_day() {
        let now = 1_800_000_000_000;
        assert!(is_check_due(None, now));
        assert!(!is_check_due(Some(now), now));
        assert!(!is_check_due(Some(now - CHECK_INTERVAL_MS + 1), now));
        assert!(is_check_due(Some(now - CHECK_INTERVAL_MS), now));
        assert!(is_check_due(Some(now + 60_000), now));
    }
}
