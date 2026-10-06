//! How subtitles look in the built-in player: size, color, background, edge, position and font.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::AppError;

/// Size in percent of the default, which itself follows the video's size.
pub const MIN_SUBTITLE_SIZE: i64 = 50;
pub const MAX_SUBTITLE_SIZE: i64 = 200;
pub const SUBTITLE_SIZE_STEP: i64 = 10;
/// Distance from the bottom of the video, in percent of its height.
pub const MAX_SUBTITLE_POSITION: i64 = 40;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum SubtitleColor {
    White,
    Yellow,
    Green,
    Cyan,
    Magenta,
}

/// What keeps the text readable over bright scenes when there is no background.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum SubtitleEdge {
    None,
    Shadow,
    Outline,
}

/// Generic families only: the system picks the actual font, so nothing has to be bundled.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum SubtitleFont {
    /// The app's own font (Inter).
    App,
    Sans,
    Serif,
    Mono,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleStyle {
    /// Percent of the default size, in steps of 10.
    pub size: i64,
    pub color: SubtitleColor,
    pub background: bool,
    /// Percent, from transparent (0) to solid (100).
    pub background_opacity: i64,
    pub edge: SubtitleEdge,
    /// Percent of the video's height between its bottom and the subtitles.
    pub position: i64,
    pub font: SubtitleFont,
}

/// The look subtitles had before they could be styled.
impl Default for SubtitleStyle {
    fn default() -> Self {
        Self {
            size: 100,
            color: SubtitleColor::White,
            background: true,
            background_opacity: 78,
            edge: SubtitleEdge::Shadow,
            position: 6,
            font: SubtitleFont::App,
        }
    }
}

fn size_is_valid(size: i64) -> bool {
    (MIN_SUBTITLE_SIZE..=MAX_SUBTITLE_SIZE).contains(&size) && size % SUBTITLE_SIZE_STEP == 0
}

fn opacity_is_valid(opacity: i64) -> bool {
    (0..=100).contains(&opacity)
}

fn position_is_valid(position: i64) -> bool {
    (0..=MAX_SUBTITLE_POSITION).contains(&position)
}

/// Checks a style before it is stored.
pub fn validate_subtitle_style(style: &SubtitleStyle) -> Result<(), AppError> {
    if !size_is_valid(style.size) {
        return Err(AppError::InvalidInput(format!(
            "subtitle size must be {MIN_SUBTITLE_SIZE}% to {MAX_SUBTITLE_SIZE}% in steps of {SUBTITLE_SIZE_STEP}, not {}%",
            style.size
        )));
    }
    if !opacity_is_valid(style.background_opacity) {
        return Err(AppError::InvalidInput(format!(
            "background opacity must be 0% to 100%, not {}%",
            style.background_opacity
        )));
    }
    if !position_is_valid(style.position) {
        return Err(AppError::InvalidInput(format!(
            "subtitle position must be 0% to {MAX_SUBTITLE_POSITION}%, not {}%",
            style.position
        )));
    }
    Ok(())
}

/// Makes a stored style usable: each out-of-range number goes back to its default on its own.
pub fn repair_subtitle_style(style: SubtitleStyle) -> SubtitleStyle {
    let defaults = SubtitleStyle::default();
    SubtitleStyle {
        size: if size_is_valid(style.size) {
            style.size
        } else {
            defaults.size
        },
        background_opacity: if opacity_is_valid(style.background_opacity) {
            style.background_opacity
        } else {
            defaults.background_opacity
        },
        position: if position_is_valid(style.position) {
            style.position
        } else {
            defaults.position
        },
        ..style
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_is_valid() {
        validate_subtitle_style(&SubtitleStyle::default()).unwrap();
    }

    #[test]
    fn rejects_values_out_of_range() {
        let defaults = SubtitleStyle::default();
        for style in [
            SubtitleStyle { size: 40, ..defaults },
            SubtitleStyle { size: 105, ..defaults },
            SubtitleStyle { size: 210, ..defaults },
            SubtitleStyle {
                background_opacity: 101,
                ..defaults
            },
            SubtitleStyle {
                background_opacity: -1,
                ..defaults
            },
            SubtitleStyle {
                position: 41,
                ..defaults
            },
        ] {
            assert!(validate_subtitle_style(&style).is_err(), "{style:?}");
        }
        let edges = SubtitleStyle {
            size: 200,
            background: false,
            background_opacity: 0,
            edge: SubtitleEdge::Outline,
            position: 40,
            ..defaults
        };
        validate_subtitle_style(&edges).unwrap();
    }

    #[test]
    fn repairs_each_bad_number_on_its_own() {
        let repaired = repair_subtitle_style(SubtitleStyle {
            size: 999,
            color: SubtitleColor::Yellow,
            background_opacity: 50,
            position: -3,
            ..SubtitleStyle::default()
        });
        assert_eq!(repaired.size, 100);
        assert_eq!(repaired.position, 6);
        assert_eq!(repaired.color, SubtitleColor::Yellow);
        assert_eq!(repaired.background_opacity, 50);
    }
}
