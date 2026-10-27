//! Interface zoom: the levels `Ctrl +` and `Ctrl -` step through, as in a browser.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

use crate::error::AppError;

/// The zoom levels, smallest first. 200% is required for low vision (WCAG 1.4.4); 300% gives room beyond it.
pub const ZOOM_LEVELS: [f64; 12] = [0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

pub const DEFAULT_ZOOM: f64 = 1.0;

/// The zoom keys, as in browsers, written as shortcut bindings (`Ctrl+Plus` is `Ctrl+Shift+=` and the keypad's `+`).
/// They are fixed and reserved: no action can take them.
pub const ZOOM_IN_KEYS: [&str; 2] = ["Ctrl+=", "Ctrl+Plus"];
pub const ZOOM_OUT_KEYS: [&str; 1] = ["Ctrl+-"];
pub const ZOOM_RESET_KEYS: [&str; 1] = ["Ctrl+0"];

/// Two levels closer than this are the same level (they come back from JSON and the webview as floats).
const SAME_LEVEL: f64 = 1e-6;

/// Where a zoom key takes the interface.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ZoomStep {
    In,
    Out,
    Reset,
}

/// The interface zoom after a change.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceZoom {
    /// One of `ZOOM_LEVELS`; 1 is 100%.
    #[specta(type = Number)]
    pub level: f64,
}

/// The level after a step. Past either end the level stays; a level between two steps moves to the next one.
pub fn step_zoom(current: f64, step: ZoomStep) -> f64 {
    match step {
        ZoomStep::In => ZOOM_LEVELS
            .into_iter()
            .find(|level| *level > current + SAME_LEVEL)
            .unwrap_or(ZOOM_LEVELS[ZOOM_LEVELS.len() - 1]),
        ZoomStep::Out => ZOOM_LEVELS
            .into_iter()
            .rev()
            .find(|level| *level < current - SAME_LEVEL)
            .unwrap_or(ZOOM_LEVELS[0]),
        ZoomStep::Reset => DEFAULT_ZOOM,
    }
}

/// Accepts only the known levels.
pub fn validate_zoom(zoom: f64) -> Result<f64, AppError> {
    ZOOM_LEVELS
        .into_iter()
        .find(|level| (level - zoom).abs() < SAME_LEVEL)
        .ok_or_else(|| AppError::InvalidInput(format!("zoom must be one of {ZOOM_LEVELS:?}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steps_through_the_levels_and_stops_at_the_ends() {
        assert_eq!(step_zoom(1.0, ZoomStep::In), 1.1);
        assert_eq!(step_zoom(1.0, ZoomStep::Out), 0.9);
        assert_eq!(step_zoom(3.0, ZoomStep::In), 3.0);
        assert_eq!(step_zoom(0.67, ZoomStep::Out), 0.67);
        assert_eq!(step_zoom(2.5, ZoomStep::Reset), DEFAULT_ZOOM);
    }

    #[test]
    fn a_level_between_steps_moves_to_the_next_one() {
        assert_eq!(step_zoom(1.2, ZoomStep::In), 1.25);
        assert_eq!(step_zoom(1.2, ZoomStep::Out), 1.1);
        assert_eq!(step_zoom(9.0, ZoomStep::Out), 3.0);
    }

    #[test]
    fn accepts_only_known_levels() {
        assert_eq!(validate_zoom(1.25).ok(), Some(1.25));
        assert_eq!(validate_zoom(1.250_000_000_1).ok(), Some(1.25));
        for invalid in [0.0, 1.2, 5.0, f64::NAN, f64::INFINITY] {
            assert!(validate_zoom(invalid).is_err(), "{invalid}");
        }
    }
}
