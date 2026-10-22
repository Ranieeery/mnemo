//! The real release source: GitHub's REST API over HTTPS. The answer is untrusted: its size is capped and only
//! `tag_name` is read.

use std::io::Read;
use std::time::Duration;

use semver::Version;
use serde::Deserialize;

use super::ReleaseSource;
use crate::domain::updates::latest_release_api_url;
use crate::error::{AppError, AppResult};

/// The whole request, redirects and body included.
const TIMEOUT: Duration = Duration::from_secs(10);
const MAX_REDIRECTS: u32 = 3;
/// The answer carries the release notes and the asset list (tens of KB); anything near this is not a release.
const MAX_RESPONSE_BYTES: u64 = 1024 * 1024;

pub struct GitHubReleases {
    agent: ureq::Agent,
}

impl GitHubReleases {
    /// Identifies itself as `Mnemo/<running version>`, without a token or anything else about the user.
    pub fn new(running: &Version) -> Self {
        let config = ureq::Agent::config_builder()
            .timeout_global(Some(TIMEOUT))
            .max_redirects(MAX_REDIRECTS)
            .https_only(true)
            .user_agent(format!("Mnemo/{running}"))
            .build();
        Self {
            agent: ureq::Agent::new_with_config(config),
        }
    }
}

impl ReleaseSource for GitHubReleases {
    fn latest_tag(&self) -> AppResult<String> {
        let mut response = self
            .agent
            .get(latest_release_api_url())
            .header("Accept", "application/vnd.github+json")
            .call()
            .map_err(request_error)?;
        read_latest_tag(response.body_mut().as_reader())
    }
}

fn request_error(error: ureq::Error) -> AppError {
    match error {
        ureq::Error::Timeout(_) => timed_out(),
        ureq::Error::StatusCode(status) => AppError::Network(format!("HTTP status {status}")),
        other => AppError::Network(other.to_string()),
    }
}

fn timed_out() -> AppError {
    AppError::Timeout("Checking for updates".into())
}

#[derive(Deserialize)]
struct LatestRelease {
    tag_name: String,
}

/// Reads at most [`MAX_RESPONSE_BYTES`] of a latest-release answer and returns its `tag_name`, still unvalidated.
fn read_latest_tag(body: impl Read) -> AppResult<String> {
    let mut bytes = Vec::new();
    body.take(MAX_RESPONSE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| match error.kind() {
            std::io::ErrorKind::TimedOut => timed_out(),
            _ => AppError::Network(error.to_string()),
        })?;
    if bytes.len() as u64 > MAX_RESPONSE_BYTES {
        return Err(AppError::InvalidResponse("the answer is too large".into()));
    }
    serde_json::from_slice::<LatestRelease>(&bytes)
        .map(|release| release.tag_name)
        .map_err(|_| AppError::InvalidResponse("it does not describe a release".into()))
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::*;

    fn read(body: &str) -> AppResult<String> {
        read_latest_tag(Cursor::new(body.as_bytes().to_vec()))
    }

    #[test]
    fn reads_only_the_tag_name() {
        let body = r#"{
            "url": "https://api.github.com/repos/Ranieeery/mnemo/releases/1",
            "html_url": "https://example.com/elsewhere",
            "tag_name": "2.7.0",
            "name": "<script>alert(1)</script>",
            "draft": false,
            "prerelease": false,
            "body": "Release notes",
            "assets": [{ "name": "mnemo.msi", "size": 123 }]
        }"#;
        assert_eq!(read(body).unwrap(), "2.7.0");
    }

    #[test]
    fn refuses_answers_without_a_tag() {
        for body in [
            "",
            "{}",
            "null",
            "[]",
            r#"{"tag_name": 270}"#,
            r#"{"tag_name": null}"#,
            r#"{"message": "Not Found"}"#,
            "<html>rate limited</html>",
            r#"{"tag_name": "2.7.0""#,
        ] {
            assert!(matches!(read(body), Err(AppError::InvalidResponse(_))), "{body:?}");
        }
    }

    #[test]
    fn refuses_oversized_answers() {
        let padding = " ".repeat(usize::try_from(MAX_RESPONSE_BYTES).unwrap());
        let body = format!(r#"{{"tag_name": "2.7.0"}}{padding}"#);
        assert!(matches!(read(&body), Err(AppError::InvalidResponse(_))));

        let fits = format!(r#"{{"tag_name": "2.7.0", "body": "{}"}}"#, "x".repeat(500_000));
        assert_eq!(read(&fits).unwrap(), "2.7.0");
    }

    /// Asks the real GitHub API: `cargo test -- --ignored real_github`.
    #[test]
    #[ignore = "needs the network"]
    fn real_github_returns_a_release_tag() {
        let source = GitHubReleases::new(&Version::new(0, 0, 0));
        let tag = source.latest_tag().unwrap();
        assert!(crate::domain::updates::ReleaseTag::parse(&tag).is_some(), "{tag:?}");
    }
}
