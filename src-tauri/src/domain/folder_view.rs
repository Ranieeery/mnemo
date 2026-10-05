use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

/// How a folder lists its videos. Set per folder and inherited by its descendants until overridden.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum FolderViewMode {
    /// Only the folder's own videos, mirroring the disk. The playlist is the folder itself.
    Folders,
    /// Every video in the tree, grouped by subfolder. The playlist spans the folder where the mode was set.
    Continuous,
}

impl FolderViewMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Folders => "folders",
            Self::Continuous => "continuous",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "folders" => Some(Self::Folders),
            "continuous" => Some(Self::Continuous),
            _ => None,
        }
    }
}

/// The effective view mode of a folder and the folder that defines it (`None` means the default applies).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedViewMode {
    pub mode: FolderViewMode,
    pub defined_at: Option<String>,
}

/// Resolves the view mode of `folder` from the explicit settings: the closest ancestor-or-self wins.
pub fn resolve_view_mode(folder: &Path, settings: &[(String, FolderViewMode)]) -> ResolvedViewMode {
    settings
        .iter()
        .filter(|(path, _)| folder.starts_with(path))
        .max_by_key(|(path, _)| Path::new(path).components().count())
        .map(|(path, mode)| ResolvedViewMode {
            mode: *mode,
            defined_at: Some(path.clone()),
        })
        .unwrap_or(ResolvedViewMode {
            mode: FolderViewMode::Folders,
            defined_at: None,
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings() -> Vec<(String, FolderViewMode)> {
        let courses = Path::new("Library").join("Courses");
        let module = courses.join("Rust").join("Module 2");
        vec![
            (courses.to_string_lossy().into_owned(), FolderViewMode::Continuous),
            (module.to_string_lossy().into_owned(), FolderViewMode::Folders),
        ]
    }

    #[test]
    fn defaults_to_folders_without_settings() {
        let resolved = resolve_view_mode(Path::new("Library"), &settings());
        assert_eq!(resolved.mode, FolderViewMode::Folders);
        assert_eq!(resolved.defined_at, None);
    }

    #[test]
    fn folder_uses_its_own_setting() {
        let courses = Path::new("Library").join("Courses");
        let resolved = resolve_view_mode(&courses, &settings());
        assert_eq!(resolved.mode, FolderViewMode::Continuous);
        assert_eq!(resolved.defined_at.as_deref(), Some(courses.to_string_lossy().as_ref()));
    }

    #[test]
    fn descendants_inherit_from_the_closest_ancestor() {
        let rust = Path::new("Library").join("Courses").join("Rust");
        let resolved = resolve_view_mode(&rust.join("Module 1"), &settings());
        assert_eq!(resolved.mode, FolderViewMode::Continuous);

        let overridden = resolve_view_mode(&rust.join("Module 2").join("Extras"), &settings());
        assert_eq!(overridden.mode, FolderViewMode::Folders);
    }

    #[test]
    fn sibling_with_shared_prefix_does_not_inherit() {
        let resolved = resolve_view_mode(&Path::new("Library").join("Courses 2"), &settings());
        assert_eq!(resolved.mode, FolderViewMode::Folders);
    }

    #[test]
    fn mode_round_trips_through_its_storage_name() {
        for mode in [FolderViewMode::Folders, FolderViewMode::Continuous] {
            assert_eq!(FolderViewMode::parse(mode.as_str()), Some(mode));
        }
        assert_eq!(FolderViewMode::parse("grid"), None);
    }
}
