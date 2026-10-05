use std::cmp::Ordering;

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
    fn handles_numbers_longer_than_any_integer_type() {
        assert_eq!(natural_cmp("v123456789012345678901234567890", "v99"), Ordering::Greater);
    }
}
