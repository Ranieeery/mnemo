use std::path::{MAIN_SEPARATOR, Path};

/// Half-open string range `[lower, upper)` that matches every path strictly inside a folder.
///
/// Filtering with `file_path >= lower AND file_path < upper` uses the unique index on `videos.file_path`, never
/// matches sibling folders that share a prefix (`Show` vs `Show 2`) and treats `_`/`%` in names literally, unlike
/// the legacy `LIKE 'folder%'` filter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderBounds {
    pub lower: String,
    pub upper: String,
}

impl FolderBounds {
    pub fn new(folder: &str) -> Self {
        let lower = if folder.ends_with(['/', '\\']) {
            folder.to_owned()
        } else {
            format!("{folder}{MAIN_SEPARATOR}")
        };
        // Both separators are ASCII, so bumping the last byte yields the smallest string above every child path.
        let mut upper = lower.clone();
        if let Some(separator) = upper.pop() {
            upper.push(char::from(separator as u8 + 1));
        }
        Self { lower, upper }
    }

    /// Number of characters (as SQLite counts them) before the first character of a child's relative path.
    pub fn prefix_chars(&self) -> usize {
        self.lower.chars().count()
    }
}

/// Returns whether `path` is `folder` itself or lies inside it, comparing whole path components.
pub fn is_within(path: &Path, folder: &Path) -> bool {
    path.starts_with(folder)
}

/// Path of `path` relative to `root`, with the platform separator; empty when they are the same folder.
pub fn relative_to(path: &Path, root: &Path) -> String {
    path.strip_prefix(root)
        .map(|relative| relative.to_string_lossy().into_owned())
        .unwrap_or_else(|_| path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn child(folder: &str, name: &str) -> String {
        format!("{folder}{MAIN_SEPARATOR}{name}")
    }

    fn contains(bounds: &FolderBounds, path: &str) -> bool {
        path >= bounds.lower.as_str() && path < bounds.upper.as_str()
    }

    #[test]
    fn matches_direct_and_nested_children() {
        let bounds = FolderBounds::new("Videos");
        assert!(contains(&bounds, &child("Videos", "a.mkv")));
        assert!(contains(&bounds, &child(&child("Videos", "Season 1"), "b.mkv")));
    }

    #[test]
    fn does_not_match_siblings_sharing_a_prefix() {
        let bounds = FolderBounds::new("Show");
        assert!(!contains(&bounds, &child("Show 2", "a.mkv")));
        assert!(!contains(&bounds, &child("Show_2", "a.mkv")));
        assert!(!contains(&bounds, "Show"));
    }

    #[test]
    fn treats_like_wildcards_literally() {
        let bounds = FolderBounds::new("100%_done");
        assert!(contains(&bounds, &child("100%_done", "a.mkv")));
        assert!(!contains(&bounds, &child("100X_done", "a.mkv")));
    }

    #[test]
    fn folder_with_trailing_separator_is_not_doubled() {
        let folder = format!("root{MAIN_SEPARATOR}");
        let bounds = FolderBounds::new(&folder);
        assert_eq!(bounds.lower, folder);
        assert!(contains(&bounds, &format!("{folder}a.mkv")));
    }

    #[test]
    fn prefix_chars_counts_unicode_characters() {
        assert_eq!(FolderBounds::new("Séries").prefix_chars(), 7);
    }

    #[test]
    fn relative_path_is_empty_for_the_root_itself() {
        let root = Path::new("Courses");
        assert_eq!(relative_to(root, root), "");
        assert_eq!(relative_to(&root.join("Module 1"), root), "Module 1");
    }
}
