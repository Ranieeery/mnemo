//! Names given in the app: a library folder's own name (its folder on disk is never renamed) and group names.

use crate::error::AppError;

/// Longest name, in characters: enough for any title, short enough to fit the sidebar in two lines or so. Applies to
/// custom folder names and group names.
pub const MAX_FOLDER_NAME_CHARS: usize = 100;

/// The custom name to store for `input`, or `None` to show the folder's own name again. Line breaks and other
/// control characters (a pasted value) become spaces and the ends are trimmed; an empty value, or the folder's own
/// name, resets it. Several folders may share a name.
pub fn normalize_custom_name(input: &str, folder_name: &str) -> Result<Option<String>, AppError> {
    let name = clean_name(input, "folder")?;
    Ok((!name.is_empty() && name != folder_name).then_some(name))
}

/// The name to store for a group: cleaned like a folder name, but never empty. Several groups may share a name.
pub fn normalize_group_name(input: &str) -> Result<String, AppError> {
    let name = clean_name(input, "group")?;
    if name.is_empty() {
        return Err(AppError::InvalidInput("group names cannot be empty".into()));
    }
    Ok(name)
}

/// Turns line breaks and other control characters (a pasted value) into spaces, trims the ends and checks the
/// length. `what` names the thing in the error.
fn clean_name(input: &str, what: &str) -> Result<String, AppError> {
    let cleaned: String = input
        .chars()
        .map(|character| if character.is_control() { ' ' } else { character })
        .collect();
    let name = cleaned.trim();
    if name.chars().count() > MAX_FOLDER_NAME_CHARS {
        return Err(AppError::InvalidInput(format!(
            "{what} names can have at most {MAX_FOLDER_NAME_CHARS} characters"
        )));
    }
    Ok(name.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn group_names_are_cleaned_like_folder_names_but_never_empty() {
        assert_eq!(normalize_group_name("  Series\n").unwrap(), "Series");
        assert!(matches!(normalize_group_name(" \t "), Err(AppError::InvalidInput(_))));
        assert_eq!(
            normalize_group_name(&"日".repeat(MAX_FOLDER_NAME_CHARS))
                .unwrap()
                .chars()
                .count(),
            MAX_FOLDER_NAME_CHARS
        );
        assert!(matches!(
            normalize_group_name(&"a".repeat(MAX_FOLDER_NAME_CHARS + 1)),
            Err(AppError::InvalidInput(message)) if message.starts_with("group names")
        ));
    }

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
