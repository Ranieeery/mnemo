//! Which hidden folders a walk of the disk leaves out.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use super::paths::is_within;

/// The folders hidden from the home page and the history. A hidden folder's videos are shown only from the folder
/// itself or from inside it: listing a folder above it (continuous view, file search, playlist) leaves it out.
#[derive(Debug, Default)]
pub struct HiddenFolders {
    paths: HashSet<PathBuf>,
}

impl HiddenFolders {
    pub fn new(paths: impl IntoIterator<Item = String>) -> Self {
        Self {
            paths: paths.into_iter().map(PathBuf::from).collect(),
        }
    }

    /// Whether a walk for `scope` (the folder being viewed) leaves out `folder` and everything inside it.
    pub fn conceals(&self, folder: &Path, scope: &Path) -> bool {
        self.paths.contains(folder) && !is_within(scope, folder)
    }
}

#[cfg(test)]
mod tests {
    use std::path::MAIN_SEPARATOR_STR;

    use super::*;

    fn path(parts: &[&str]) -> PathBuf {
        PathBuf::from(parts.join(MAIN_SEPARATOR_STR))
    }

    #[test]
    fn a_hidden_folder_is_left_out_only_when_viewed_from_outside() {
        let hidden = HiddenFolders::new([path(&["Lib", "Private"]).to_string_lossy().into_owned()]);
        let private = path(&["Lib", "Private"]);
        assert!(hidden.conceals(&private, &path(&["Lib"])));
        assert!(!hidden.conceals(&private, &private));
        assert!(!hidden.conceals(&private, &path(&["Lib", "Private", "Season 1"])));
        // Only the hidden folder itself is matched, never a sibling sharing its prefix.
        assert!(!hidden.conceals(&path(&["Lib", "Private 2"]), &path(&["Lib"])));
        assert!(!hidden.conceals(&path(&["Lib", "Other"]), &path(&["Lib"])));
    }

    #[test]
    fn a_hidden_folder_inside_another_stays_out_from_the_outer_one() {
        let hidden = HiddenFolders::new(
            [path(&["Lib", "Private"]), path(&["Lib", "Private", "More"])]
                .map(|path| path.to_string_lossy().into_owned()),
        );
        assert!(hidden.conceals(&path(&["Lib", "Private", "More"]), &path(&["Lib", "Private"])));
    }
}
