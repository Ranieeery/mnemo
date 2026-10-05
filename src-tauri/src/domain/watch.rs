use crate::error::AppError;

/// Fraction of a video that must be watched for it to count as watched, unless the user changes it in Settings.
pub const DEFAULT_WATCHED_THRESHOLD: f64 = 0.90;
pub const MIN_WATCHED_THRESHOLD: f64 = 0.50;
pub const MAX_WATCHED_THRESHOLD: f64 = 1.00;
pub const WATCHED_THRESHOLD_STEP: f64 = 0.05;

/// Validates a threshold coming from the user: inside the allowed range and on a 5% step.
pub fn validate_threshold(threshold: f64) -> Result<f64, AppError> {
    let in_range = (MIN_WATCHED_THRESHOLD..=MAX_WATCHED_THRESHOLD).contains(&threshold);
    let steps = threshold / WATCHED_THRESHOLD_STEP;
    let on_step = (steps - steps.round()).abs() < 1e-9;
    if in_range && on_step {
        Ok(threshold)
    } else {
        Err(AppError::InvalidInput(format!(
            "watched threshold must be between {MIN_WATCHED_THRESHOLD} and {MAX_WATCHED_THRESHOLD} in steps of \
             {WATCHED_THRESHOLD_STEP}"
        )))
    }
}

/// Returns whether a playback position reaches the watched threshold. Videos with unknown duration never do.
pub fn reaches_threshold(position_seconds: f64, duration_seconds: f64, threshold: f64) -> bool {
    duration_seconds > 0.0 && position_seconds >= duration_seconds * threshold
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_thresholds_on_the_step_grid() {
        for value in [0.5, 0.55, 0.75, 0.9, 0.95, 1.0] {
            assert_eq!(validate_threshold(value).ok(), Some(value));
        }
    }

    #[test]
    fn rejects_thresholds_out_of_range_or_off_step() {
        for value in [0.45, 1.05, 0.0, 0.92, f64::NAN] {
            assert!(validate_threshold(value).is_err(), "{value}");
        }
    }

    #[test]
    fn default_threshold_is_valid() {
        assert!(validate_threshold(DEFAULT_WATCHED_THRESHOLD).is_ok());
    }

    #[test]
    fn position_reaches_threshold_at_the_exact_fraction() {
        assert!(!reaches_threshold(89.9, 100.0, 0.9));
        assert!(reaches_threshold(90.0, 100.0, 0.9));
        assert!(reaches_threshold(100.0, 100.0, 1.0));
    }

    #[test]
    fn unknown_duration_never_reaches_threshold() {
        assert!(!reaches_threshold(500.0, 0.0, 0.9));
    }
}
