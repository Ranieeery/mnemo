use crate::error::AppError;

/// Longest tag name, in characters, accepted when a tag is created or added.
pub const MAX_TAG_NAME_CHARS: usize = 100;

/// Tags are stored trimmed and lowercase so "Anime" and " anime " are the same tag. Line breaks and other control
/// characters (a pasted value) become spaces. Rejects blank names and names longer than [`MAX_TAG_NAME_CHARS`].
pub fn normalize_tag_name(name: &str) -> Result<String, AppError> {
    let normalized = clean_tag_name(name);
    if normalized.is_empty() {
        return Err(AppError::InvalidInput("tag name cannot be empty".into()));
    }
    if normalized.chars().count() > MAX_TAG_NAME_CHARS {
        return Err(AppError::InvalidInput(format!(
            "tag names can have at most {MAX_TAG_NAME_CHARS} characters"
        )));
    }
    Ok(normalized)
}

/// A tag name as stored, without the length check: imports keep the long tags older versions accepted.
pub fn clean_tag_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|character| if character.is_control() { ' ' } else { character })
        .collect();
    cleaned.trim().to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_and_lowercases() {
        assert_eq!(normalize_tag_name("  Anime ").ok().as_deref(), Some("anime"));
        assert_eq!(normalize_tag_name("Ação").ok().as_deref(), Some("ação"));
    }

    #[test]
    fn rejects_blank_names() {
        assert!(normalize_tag_name("   ").is_err());
        assert!(normalize_tag_name("").is_err());
        assert!(normalize_tag_name("\n\t").is_err());
    }

    #[test]
    fn control_characters_become_spaces() {
        assert_eq!(normalize_tag_name("\tSci\nFi\r\n").ok().as_deref(), Some("sci fi"));
    }

    #[test]
    fn rejects_names_past_the_limit_in_characters() {
        assert_eq!(
            normalize_tag_name(&"日".repeat(MAX_TAG_NAME_CHARS))
                .map(|name| name.chars().count())
                .ok(),
            Some(MAX_TAG_NAME_CHARS)
        );
        assert!(matches!(
            normalize_tag_name(&"a".repeat(MAX_TAG_NAME_CHARS + 1)),
            Err(AppError::InvalidInput(_))
        ));
        assert_eq!(
            clean_tag_name(&"A".repeat(MAX_TAG_NAME_CHARS + 1)).len(),
            MAX_TAG_NAME_CHARS + 1
        );
    }
}
