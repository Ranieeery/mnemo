//! The name a library folder shows in the app, which can differ from its folder on disk (never renamed).

use crate::error::AppError;

/// Longest custom name, in characters: enough for any title, short enough to fit the sidebar in two lines or so.
pub const MAX_FOLDER_NAME_CHARS: usize = 100;

/// The custom name to store for `input`, or `None` to show the folder's own name again. Line breaks and other
/// control characters (a pasted value) become spaces and the ends are trimmed; an empty value, or the folder's own
/// name, resets it. Several folders may share a name.
pub fn normalize_custom_name(input: &str, folder_name: &str) -> Result<Option<String>, AppError> {
    let cleaned: String = input
        .chars()
        .map(|character| if character.is_control() { ' ' } else { character })
        .collect();
    let name = cleaned.trim();
    if name.chars().count() > MAX_FOLDER_NAME_CHARS {
        return Err(AppError::InvalidInput(format!(
            "folder names can have at most {MAX_FOLDER_NAME_CHARS} characters"
        )));
    }
    Ok((!name.is_empty() && name != folder_name).then(|| name.to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_and_turns_control_characters_into_spaces() {
        assert_eq!(
            normalize_custom_name("  My\tanime\n ", "Anime").unwrap().as_deref(),
            Some("My anime")
        );
    }

    #[test]
    fn an_empty_value_or_the_folder_name_resets_it() {
        assert_eq!(normalize_custom_name("", "Anime").unwrap(), None);
        assert_eq!(normalize_custom_name(" \n ", "Anime").unwrap(), None);
        assert_eq!(normalize_custom_name(" Anime ", "Anime").unwrap(), None);
        assert_eq!(
            normalize_custom_name("anime", "Anime").unwrap().as_deref(),
            Some("anime")
        );
    }

    #[test]
    fn the_limit_counts_characters() {
        let longest = "é".repeat(MAX_FOLDER_NAME_CHARS);
        assert_eq!(
            normalize_custom_name(&longest, "Anime").unwrap().as_deref(),
            Some(longest.as_str())
        );
        assert_eq!(
            normalize_custom_name(&"日".repeat(MAX_FOLDER_NAME_CHARS), "Anime")
                .unwrap()
                .map(|name| name.chars().count()),
            Some(MAX_FOLDER_NAME_CHARS)
        );
        assert!(matches!(
            normalize_custom_name(&"a".repeat(MAX_FOLDER_NAME_CHARS + 1), "Anime"),
            Err(AppError::InvalidInput(_))
        ));
        // Spaces around a long name are trimmed before counting.
        assert!(normalize_custom_name(&format!("  {}  ", "a".repeat(MAX_FOLDER_NAME_CHARS)), "Anime").is_ok());
    }
}
