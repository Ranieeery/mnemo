use std::cmp::Ordering;
use std::path::Path;

/// Orders strings the way people expect file names to be ordered: runs of digits compare by numeric value
/// ("Ep 2" before "Ep 10") and letters compare case-insensitively. Ties fall back to a plain comparison so the
/// order is total and stable.
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let mut left = Chunks::new(a);
    let mut right = Chunks::new(b);
    loop {
        match (left.next(), right.next()) {
            (None, None) => return a.cmp(b),
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) => {
                let ordering = compare_chunks(x, y);
                if ordering != Ordering::Equal {
                    return ordering;
                }
            }
        }
    }
}

/// Orders paths folder by folder with [`natural_cmp`], the way a tree lists them: `Course`, `Course\Module 1`,
/// `Course 2`. Comparing whole strings would put `Course 2` first, because a space sorts before the separator.
pub fn natural_path_cmp(a: &Path, b: &Path) -> Ordering {
    let mut left = a.components();
    let mut right = b.components();
    loop {
        match (left.next(), right.next()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) => {
                let ordering = natural_cmp(&x.as_os_str().to_string_lossy(), &y.as_os_str().to_string_lossy());
                if ordering != Ordering::Equal {
                    return ordering;
                }
            }
        }
    }
}

/// Orders files the way the continuous view reads a tree: a folder's own files first, by name, then each subfolder
/// followed by its own subfolders (folders compared with [`natural_path_cmp`], file names with [`natural_cmp`]).
pub fn reading_order_cmp(a: &Path, b: &Path) -> Ordering {
    let folder = |path: &Path| path.parent().map(Path::to_path_buf).unwrap_or_default();
    let name = |path: &Path| {
        path.file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default()
    };
    natural_path_cmp(&folder(a), &folder(b)).then_with(|| natural_cmp(&name(a), &name(b)))
}

fn compare_chunks(a: &str, b: &str) -> Ordering {
    let a_is_number = a.starts_with(|c: char| c.is_ascii_digit());
    let b_is_number = b.starts_with(|c: char| c.is_ascii_digit());
    match (a_is_number, b_is_number) {
        (true, true) => {
            let a_digits = a.trim_start_matches('0');
            let b_digits = b.trim_start_matches('0');
            a_digits.len().cmp(&b_digits.len()).then_with(|| a_digits.cmp(b_digits))
        }
        _ => a
            .chars()
            .flat_map(char::to_lowercase)
            .cmp(b.chars().flat_map(char::to_lowercase)),
    }
}

/// Splits a string into alternating runs of ASCII digits and non-digits.
struct Chunks<'a> {
    rest: &'a str,
}

impl<'a> Chunks<'a> {
    fn new(value: &'a str) -> Self {
        Self { rest: value }
    }
}

impl<'a> Iterator for Chunks<'a> {
    type Item = &'a str;

    fn next(&mut self) -> Option<Self::Item> {
        let first = self.rest.chars().next()?;
        let is_digit = first.is_ascii_digit();
        let end = self
            .rest
            .find(|c: char| c.is_ascii_digit() != is_digit)
            .unwrap_or(self.rest.len());
        let (chunk, rest) = self.rest.split_at(end);
        self.rest = rest;
        Some(chunk)
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn sorted(mut values: Vec<&str>) -> Vec<&str> {
        values.sort_by(|a, b| natural_cmp(a, b));
        values
    }

    #[test]
    fn orders_numbers_by_value() {
        assert_eq!(
            sorted(vec!["Ep 10", "Ep 2", "Ep 1", "Ep 21", "Ep 3"]),
            vec!["Ep 1", "Ep 2", "Ep 3", "Ep 10", "Ep 21"]
        );
    }

    #[test]
    fn orders_season_and_episode_codes() {
        assert_eq!(
            sorted(vec!["S01E10.mkv", "S02E01.mkv", "S01E02.mkv", "S01E01.mkv"]),
            vec!["S01E01.mkv", "S01E02.mkv", "S01E10.mkv", "S02E01.mkv"]
        );
    }

    #[test]
    fn ignores_case_for_letters() {
        assert_eq!(
            sorted(vec!["beta", "Alpha", "alpha 2"]),
            vec!["Alpha", "alpha 2", "beta"]
        );
    }

    #[test]
    fn leading_zeros_do_not_change_numeric_order() {
        assert_eq!(sorted(vec!["Ep 010", "Ep 9"]), vec!["Ep 9", "Ep 010"]);
    }

    #[test]
    fn prefixes_come_first_and_ties_are_stable() {
        assert_eq!(natural_cmp("Ep", "Ep 1"), Ordering::Less);
        assert_eq!(natural_cmp("a", "A"), "a".cmp("A"));
        assert_eq!(natural_cmp("same", "same"), Ordering::Equal);
    }

    #[test]
    fn orders_paths_folder_by_folder() {
        // Regression (B7): comparing whole strings put `Course 2` between `Course` and its subfolders.
        let paths = |list: &[&str]| -> Vec<PathBuf> { list.iter().map(|path| path.split('/').collect()).collect() };
        let mut sorted = paths(&["Course 10", "Course 2", "Course/Module 10", "Course/Module 2", "Course"]);
        sorted.sort_by(|a, b| natural_path_cmp(a, b));
        assert_eq!(
            sorted,
            paths(&["Course", "Course/Module 2", "Course/Module 10", "Course 2", "Course 10"])
        );
        assert_eq!(natural_path_cmp(Path::new(""), Path::new("a")), Ordering::Less);
    }

    #[test]
    fn reads_a_folder_before_its_subfolders_and_each_subfolder_before_the_next() {
        let paths = |list: &[&str]| -> Vec<PathBuf> { list.iter().map(|path| path.split('/').collect()).collect() };
        let mut sorted = paths(&[
            "Course 2/Video 1.mkv",
            "Course_/Video 1.mkv",
            "Course/Module 2/Video 1.mkv",
            "Course/Zeta.mkv",
            "Course/Module 1/Video 10.mkv",
            "Course/Module 1/Video 2.mkv",
            "Course/Intro.mkv",
            "Root 10.mkv",
            "Root 2.mkv",
        ]);
        sorted.sort_by(|a, b| reading_order_cmp(a, b));
        assert_eq!(
            sorted,
            paths(&[
                "Root 2.mkv",
                "Root 10.mkv",
                "Course/Intro.mkv",
                "Course/Zeta.mkv",
                "Course/Module 1/Video 2.mkv",
                "Course/Module 1/Video 10.mkv",
                "Course/Module 2/Video 1.mkv",
                "Course 2/Video 1.mkv",
                "Course_/Video 1.mkv",
            ])
        );
    }

    #[test]
    fn handles_numbers_longer_than_any_integer_type() {
        assert_eq!(natural_cmp("v123456789012345678901234567890", "v99"), Ordering::Greater);
    }
}
