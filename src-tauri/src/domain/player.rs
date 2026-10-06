//! Limits of the built-in player's preferences.

use crate::error::AppError;

pub const MIN_PLAYBACK_SPEED: f64 = 0.25;
pub const MAX_PLAYBACK_SPEED: f64 = 2.0;
pub const PLAYBACK_SPEED_STEP: f64 = 0.25;

/// Narrowest and widest the "Up next" column can be dragged, in pixels.
pub const MIN_UP_NEXT_WIDTH: i64 = 240;
pub const MAX_UP_NEXT_WIDTH: i64 = 800;

/// A volume between silent (0) and full (1).
pub fn validate_volume(volume: f64) -> Result<f64, AppError> {
    if (0.0..=1.0).contains(&volume) {
        Ok(volume)
    } else {
        Err(AppError::InvalidInput(format!(
            "volume must be between 0 and 1, not {volume}"
        )))
    }
}

/// A chosen "Up next" width inside the allowed range (`None`, automatic, is always fine).
pub fn validate_up_next_width(width: Option<i64>) -> Result<Option<i64>, AppError> {
    match width {
        Some(pixels) if !(MIN_UP_NEXT_WIDTH..=MAX_UP_NEXT_WIDTH).contains(&pixels) => {
            Err(AppError::InvalidInput(format!(
                "the Up next width must be between {MIN_UP_NEXT_WIDTH} and {MAX_UP_NEXT_WIDTH} pixels, not {pixels}"
            )))
        }
        _ => Ok(width),
    }
}

/// A playback speed inside the allowed range and on a 0.25 step.
pub fn validate_speed(speed: f64) -> Result<f64, AppError> {
    let in_range = (MIN_PLAYBACK_SPEED..=MAX_PLAYBACK_SPEED).contains(&speed);
    let steps = speed / PLAYBACK_SPEED_STEP;
    if in_range && (steps - steps.round()).abs() < 1e-9 {
        Ok(speed)
    } else {
        Err(AppError::InvalidInput(format!(
            "playback speed must be between {MIN_PLAYBACK_SPEED} and {MAX_PLAYBACK_SPEED} in steps of \
             {PLAYBACK_SPEED_STEP}, not {speed}"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_volumes_from_silent_to_full() {
        for volume in [0.0, 0.05, 0.5, 1.0] {
            assert_eq!(validate_volume(volume).ok(), Some(volume));
        }
        for volume in [-0.1, 1.01, f64::NAN, f64::INFINITY] {
            assert!(validate_volume(volume).is_err(), "{volume}");
        }
    }

    #[test]
    fn accepts_up_next_widths_in_range_or_automatic() {
        for width in [None, Some(240), Some(512), Some(800)] {
            assert_eq!(validate_up_next_width(width).ok(), Some(width));
        }
        for width in [Some(0), Some(239), Some(801)] {
            assert!(validate_up_next_width(width).is_err(), "{width:?}");
        }
    }

    #[test]
    fn accepts_speeds_on_the_step_grid() {
        for speed in [0.25, 1.0, 1.75, 2.0] {
            assert_eq!(validate_speed(speed).ok(), Some(speed));
        }
        for speed in [0.0, 1.1, 2.25, f64::NAN] {
            assert!(validate_speed(speed).is_err(), "{speed}");
        }
    }
}
