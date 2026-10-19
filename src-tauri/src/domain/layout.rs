//! How the app's window is laid out: the sidebar's width and whether it is collapsed to a rail of icons.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::AppError;

/// Width of the expanded sidebar in pixels: where it starts, and how narrow and wide its edge can be dragged.
pub const DEFAULT_SIDEBAR_WIDTH: i64 = 240;
pub const MIN_SIDEBAR_WIDTH: i64 = 200;
pub const MAX_SIDEBAR_WIDTH: i64 = 400;

/// The sidebar as it was last left, kept between sessions. Fields missing from a stored value take their default
/// (see `db::settings::Sidebar`), so fields can be added later without a migration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SidebarPreferences {
    /// Collapsed to a narrow rail of icons.
    pub collapsed: bool,
    /// Width in pixels when expanded, set by dragging its edge.
    pub width: i64,
}

impl Default for SidebarPreferences {
    fn default() -> Self {
        Self {
            collapsed: false,
            width: DEFAULT_SIDEBAR_WIDTH,
        }
    }
}

/// A sidebar width inside the allowed range.
pub fn validate_sidebar_width(width: i64) -> Result<i64, AppError> {
    if (MIN_SIDEBAR_WIDTH..=MAX_SIDEBAR_WIDTH).contains(&width) {
        Ok(width)
    } else {
        Err(AppError::InvalidInput(format!(
            "the sidebar width must be between {MIN_SIDEBAR_WIDTH} and {MAX_SIDEBAR_WIDTH} pixels, not {width}"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_expanded_at_the_default_width() {
        let preferences = SidebarPreferences::default();
        assert!(!preferences.collapsed);
        assert_eq!(
            validate_sidebar_width(preferences.width).ok(),
            Some(DEFAULT_SIDEBAR_WIDTH)
        );
    }

    #[test]
    fn accepts_sidebar_widths_in_range() {
        for width in [200, 240, 400] {
            assert_eq!(validate_sidebar_width(width).ok(), Some(width));
        }
        for width in [0, 199, 401, -240] {
            assert!(validate_sidebar_width(width).is_err(), "{width}");
        }
    }
}
