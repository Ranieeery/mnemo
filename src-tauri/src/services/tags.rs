use crate::db::{Db, tags, videos};
use crate::domain::models::{Tag, TagWithUsage};
use crate::domain::tags::normalize_tag_name;
use crate::error::AppResult;

pub async fn list(db: &Db) -> AppResult<Vec<TagWithUsage>> {
    db.call(|connection| tags::list_with_usage(connection)).await
}

pub async fn for_video(db: &Db, video_id: i64) -> AppResult<Vec<Tag>> {
    db.call(move |connection| tags::for_video(connection, video_id)).await
}

/// Adds a tag (created on demand) to a video and returns the video's tags.
pub async fn add_to_video(db: &Db, video_id: i64, name: String) -> AppResult<Vec<Tag>> {
    let name = normalize_tag_name(&name)?;
    db.call(move |connection| {
        let transaction = connection.transaction()?;
        videos::get(&transaction, video_id)?;
        let tag = tags::find_or_create(&transaction, &name)?;
        tags::add_to_video(&transaction, video_id, tag.id)?;
        let video_tags = tags::for_video(&transaction, video_id)?;
        transaction.commit()?;
        Ok(video_tags)
    })
    .await
}

pub async fn remove_from_video(db: &Db, video_id: i64, tag_id: i64) -> AppResult<Vec<Tag>> {
    db.call(move |connection| {
        tags::remove_from_video(connection, video_id, tag_id)?;
        tags::for_video(connection, video_id)
    })
    .await
}

pub async fn add_to_folder(db: &Db, path: String, name: String) -> AppResult<i64> {
    let name = normalize_tag_name(&name)?;
    db.call(move |connection| {
        let transaction = connection.transaction()?;
        let tag = tags::find_or_create(&transaction, &name)?;
        let added = tags::add_to_folder(&transaction, &path, tag.id)?;
        transaction.commit()?;
        Ok(added as i64)
    })
    .await
}

pub async fn remove_all_from_folder(db: &Db, path: String) -> AppResult<i64> {
    db.call(move |connection| Ok(tags::remove_all_in_folder(connection, &path)? as i64))
        .await
}

pub async fn delete(db: &Db, tag_id: i64) -> AppResult<()> {
    db.call(move |connection| tags::delete(connection, tag_id)).await
}

pub async fn remove_from_all_videos(db: &Db, tag_id: i64) -> AppResult<i64> {
    db.call(move |connection| Ok(tags::remove_from_all_videos(connection, tag_id)? as i64))
        .await
}

pub async fn delete_all(db: &Db) -> AppResult<i64> {
    db.call(|connection| Ok(tags::delete_all(connection)? as i64)).await
}

pub async fn delete_unused(db: &Db) -> AppResult<i64> {
    db.call(|connection| Ok(tags::delete_unused(connection)? as i64)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppError;

    #[tokio::test]
    async fn adding_normalizes_names_and_requires_an_existing_video() {
        let db = Db::open_in_memory().unwrap();
        let video = db
            .call(|connection| {
                videos::insert(
                    connection,
                    &videos::NewVideo {
                        file_path: "a.mkv",
                        title: "a",
                        duration_seconds: 1.0,
                        thumbnail_path: None,
                    },
                )
            })
            .await
            .unwrap();

        let tags = add_to_video(&db, video.id, "  Anime ".into()).await.unwrap();
        assert_eq!(tags[0].name, "anime");
        assert!(matches!(
            add_to_video(&db, video.id, " ".into()).await,
            Err(AppError::InvalidInput(_))
        ));
        assert!(matches!(
            add_to_video(&db, 999, "x".into()).await,
            Err(AppError::NotFound(_))
        ));
        assert_eq!(list(&db).await.unwrap().len(), 1);
    }
}
