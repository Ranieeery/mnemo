//! A video's own details: looking one up by its file and editing its title and description.

use crate::db::{Db, videos};
use crate::domain::models::Video;
use crate::error::{AppError, AppResult};

pub async fn find_by_path(db: &Db, path: String) -> AppResult<Option<Video>> {
    db.call(move |connection| videos::find_by_path(connection, &path)).await
}

/// Stores the title (trimmed, never blank) and the description given in the app.
pub async fn update_details(db: &Db, id: i64, title: String, description: String) -> AppResult<Video> {
    let title = title.trim().to_owned();
    if title.is_empty() {
        return Err(AppError::InvalidInput("title cannot be empty".into()));
    }
    db.call(move |connection| videos::update_details(connection, id, &title, &description))
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::videos::NewVideo;

    async fn stored_video(db: &Db) -> Video {
        db.call(|connection| {
            videos::insert(
                connection,
                &NewVideo {
                    file_path: "a.mkv",
                    title: "a",
                    duration_seconds: 100.0,
                    thumbnail_path: None,
                    identity: None,
                },
            )
        })
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn the_title_is_trimmed_and_never_blank() {
        let db = Db::open_in_memory().unwrap();
        let video = stored_video(&db).await;

        let updated = update_details(&db, video.id, "  Pilot \n".into(), "First episode".into())
            .await
            .unwrap();
        assert_eq!(
            (updated.title.as_str(), updated.description.as_str()),
            ("Pilot", "First episode")
        );
        assert!(matches!(
            update_details(&db, video.id, " \t".into(), String::new()).await,
            Err(AppError::InvalidInput(_))
        ));
        assert_eq!(
            find_by_path(&db, "a.mkv".into())
                .await
                .unwrap()
                .map(|video| video.title)
                .as_deref(),
            Some("Pilot")
        );
    }
}
