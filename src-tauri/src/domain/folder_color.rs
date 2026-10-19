//! Colors a library folder's icon can take. Stored by name in `library_folders.icon_color`; the frontend draws each
//! with the `--color-folder-<name>` token, which has a value per theme.

use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum FolderColor {
    Red,
    Orange,
    Amber,
    Lime,
    Green,
    Teal,
    Cyan,
    Blue,
    Violet,
    Pink,
}

impl FolderColor {
    /// Every color, in the order the picker shows them.
    pub const ALL: [Self; 10] = [
        Self::Red,
        Self::Orange,
        Self::Amber,
        Self::Lime,
        Self::Green,
        Self::Teal,
        Self::Cyan,
        Self::Blue,
        Self::Violet,
        Self::Pink,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Red => "red",
            Self::Orange => "orange",
            Self::Amber => "amber",
            Self::Lime => "lime",
            Self::Green => "green",
            Self::Teal => "teal",
            Self::Cyan => "cyan",
            Self::Blue => "blue",
            Self::Violet => "violet",
            Self::Pink => "pink",
        }
    }

    /// A stored name, or `None` for anything else (the default color applies).
    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|color| color.as_str() == value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_round_trip_and_unknown_ones_are_rejected() {
        for color in FolderColor::ALL {
            assert_eq!(FolderColor::parse(color.as_str()), Some(color));
            assert_eq!(
                serde_json::to_value(color).unwrap(),
                serde_json::Value::String(color.as_str().to_owned())
            );
        }
        for unknown in ["", "Red", "purple", "#ff0000"] {
            assert_eq!(FolderColor::parse(unknown), None, "{unknown}");
        }
    }
}
