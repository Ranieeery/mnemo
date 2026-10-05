use crate::error::AppError;

/// Tags are stored trimmed and lowercase so "Anime" and " anime " are the same tag.
pub fn normalize_tag_name(name: &str) -> Result<String, AppError> {
    let normalized = name.trim().to_lowercase();
    if normalized.is_empty() {
        Err(AppError::InvalidInput("tag name cannot be empty".into()))
    } else {
        Ok(normalized)
    }
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
    }
}
