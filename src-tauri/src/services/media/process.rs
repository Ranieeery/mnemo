use std::ffi::OsStr;
use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;
use tokio_util::sync::CancellationToken;

use crate::error::{AppError, AppResult};

/// Runs an external tool without a console window, kills it after `timeout` and returns its stdout.
pub async fn run<I, S>(program: &str, args: I, timeout: Duration) -> AppResult<Vec<u8>>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run_until_cancelled(program, args, timeout, &CancellationToken::new()).await
}

/// Like [`run`], but `cancel` stops it early: the child process is killed at once (`kill_on_drop`) and the result is
/// [`AppError::Cancelled`].
pub async fn run_until_cancelled<I, S>(
    program: &str,
    args: I,
    timeout: Duration,
    cancel: &CancellationToken,
) -> AppResult<Vec<u8>>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    // Dropping the output future (on timeout or cancellation) drops the child, which kills it.
    let finished = tokio::select! {
        finished = tokio::time::timeout(timeout, command.output()) => finished,
        () = cancel.cancelled() => return Err(AppError::Cancelled),
    };
    let output = match finished {
        Err(_) => return Err(AppError::Timeout(program.to_owned())),
        Ok(Err(error)) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(AppError::MediaToolMissing {
                tool: program.to_owned(),
            });
        }
        Ok(Err(error)) => {
            return Err(AppError::MediaProcessFailed {
                tool: program.to_owned(),
                message: error.to_string(),
            });
        }
        Ok(Ok(output)) => output,
    };

    if output.status.success() {
        Ok(output.stdout)
    } else {
        Err(AppError::MediaProcessFailed {
            tool: program.to_owned(),
            message: last_lines(&String::from_utf8_lossy(&output.stderr), 3),
        })
    }
}

/// ffmpeg prints a long banner before the actual error, which is at the end.
fn last_lines(text: &str, count: usize) -> String {
    let lines: Vec<&str> = text.lines().filter(|line| !line.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(count)..].join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_the_last_non_empty_lines() {
        assert_eq!(last_lines("banner\n\nconfig\nerror: bad\n", 2), "config\nerror: bad");
        assert_eq!(last_lines("", 3), "");
    }

    /// A command that runs for about 30 seconds on every platform, with no ffmpeg needed.
    fn long_command() -> (&'static str, Vec<&'static str>) {
        if cfg!(windows) {
            ("ping", vec!["-n", "30", "127.0.0.1"])
        } else {
            ("sleep", vec!["30"])
        }
    }

    #[tokio::test]
    async fn cancelling_kills_the_child_at_once() {
        let (program, args) = long_command();
        let cancel = CancellationToken::new();
        let trigger = cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(200)).await;
            trigger.cancel();
        });
        let started = std::time::Instant::now();
        let result = run_until_cancelled(program, args, Duration::from_secs(60), &cancel).await;
        assert!(matches!(result, Err(AppError::Cancelled)), "{result:?}");
        assert!(started.elapsed() < Duration::from_secs(5), "{:?}", started.elapsed());
    }

    #[tokio::test]
    async fn missing_program_is_reported_as_missing_tool() {
        let result = run("mnemo-definitely-not-installed", ["--version"], Duration::from_secs(5)).await;
        assert!(matches!(result, Err(AppError::MediaToolMissing { tool }) if tool == "mnemo-definitely-not-installed"));
    }
}
