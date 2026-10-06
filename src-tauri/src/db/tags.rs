use rusqlite::{Connection, params};

use crate::domain::models::{Tag, TagWithUsage};
use crate::domain::paths::FolderBounds;
use crate::error::{AppError, AppResult};

/// Lists every tag with how many videos use it.
pub fn list_with_usage(connection: &Connection) -> AppResult<Vec<TagWithUsage>> {
    let mut statement = connection.prepare_cached(
        "SELECT t.id, t.name, COUNT(vt.video_id) FROM tags t
         LEFT JOIN video_tags vt ON vt.tag_id = t.id
         GROUP BY t.id ORDER BY t.name",
    )?;
    let tags = statement
        .query_map([], |row| {
            Ok(TagWithUsage {
                id: row.get(0)?,
                name: row.get(1)?,
                video_count: row.get(2)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(tags)
}

/// Creates a tag that no video uses yet. `name` must already be normalized by the caller.
pub fn create(connection: &Connection, name: &str) -> AppResult<Tag> {
    let inserted = connection.execute(
        "INSERT INTO tags (name) VALUES (?1) ON CONFLICT (name) DO NOTHING",
        [name],
    )?;
    if inserted == 0 {
        return Err(AppError::InvalidInput(format!("a tag named \"{name}\" already exists")));
    }
    Ok(Tag {
        id: connection.last_insert_rowid(),
        name: name.to_owned(),
    })
}

/// Returns the tag with this name, creating it if needed. `name` must already be normalized by the caller.
pub fn find_or_create(connection: &Connection, name: &str) -> AppResult<Tag> {
    connection.execute(
        "INSERT INTO tags (name) VALUES (?1) ON CONFLICT (name) DO NOTHING",
        [name],
    )?;
    let id = connection.query_row("SELECT id FROM tags WHERE name = ?1", [name], |row| row.get(0))?;
    Ok(Tag {
        id,
        name: name.to_owned(),
    })
}

pub fn for_video(connection: &Connection, video_id: i64) -> AppResult<Vec<Tag>> {
    let mut statement = connection.prepare_cached(
        "SELECT t.id, t.name FROM tags t JOIN video_tags vt ON vt.tag_id = t.id
         WHERE vt.video_id = ?1 ORDER BY t.name",
    )?;
    let tags = statement
        .query_map([video_id], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(tags)
}

pub fn add_to_video(connection: &Connection, video_id: i64, tag_id: i64) -> AppResult<()> {
    connection.execute(
        "INSERT INTO video_tags (video_id, tag_id) VALUES (?1, ?2) ON CONFLICT (video_id, tag_id) DO NOTHING",
        params![video_id, tag_id],
    )?;
    Ok(())
}

pub fn remove_from_video(connection: &Connection, video_id: i64, tag_id: i64) -> AppResult<()> {
    connection.execute(
        "DELETE FROM video_tags WHERE video_id = ?1 AND tag_id = ?2",
        params![video_id, tag_id],
    )?;
    Ok(())
}

/// Tags every video inside `folder`. Returns how many videos received the tag (already tagged ones excluded).
pub fn add_to_folder(connection: &Connection, folder: &str, tag_id: i64) -> AppResult<usize> {
    let bounds = FolderBounds::new(folder);
    Ok(connection.execute(
        "INSERT INTO video_tags (video_id, tag_id)
         SELECT id, ?3 FROM videos WHERE file_path >= ?1 AND file_path < ?2
         ON CONFLICT (video_id, tag_id) DO NOTHING",
        params![bounds.lower, bounds.upper, tag_id],
    )?)
}

/// Removes every tag from the videos inside `folder`. Returns how many assignments were removed.
pub fn remove_all_in_folder(connection: &Connection, folder: &str) -> AppResult<usize> {
    let bounds = FolderBounds::new(folder);
    Ok(connection.execute(
        "DELETE FROM video_tags
         WHERE video_id IN (SELECT id FROM videos WHERE file_path >= ?1 AND file_path < ?2)",
        params![bounds.lower, bounds.upper],
    )?)
}

pub fn delete(connection: &Connection, tag_id: i64) -> AppResult<()> {
    if connection.execute("DELETE FROM tags WHERE id = ?1", [tag_id])? == 0 {
        return Err(AppError::NotFound(format!("tag {tag_id}")));
    }
    Ok(())
}

/// Detaches a tag from every video, keeping the tag itself. Returns how many videos had it.
pub fn remove_from_all_videos(connection: &Connection, tag_id: i64) -> AppResult<usize> {
    Ok(connection.execute("DELETE FROM video_tags WHERE tag_id = ?1", [tag_id])?)
}

/// Deletes every tag (assignments cascade). Returns how many tags were deleted.
pub fn delete_all(connection: &Connection) -> AppResult<usize> {
    Ok(connection.execute("DELETE FROM tags", [])?)
}

/// Deletes tags no video uses. Returns how many were deleted.
pub fn delete_unused(connection: &Connection) -> AppResult<usize> {
    Ok(connection.execute(
        "DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM video_tags WHERE tag_id = tags.id)",
        [],
    )?)
}

pub fn count(connection: &Connection) -> AppResult<i64> {
    Ok(connection.query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support;
    use crate::db::videos::tests::{add_video, path};

    #[test]
    fn create_rejects_duplicates() {
        let connection = test_support::connection();
        let created = create(&connection, "anime").unwrap();
        assert_eq!(find_or_create(&connection, "anime").unwrap(), created);
        assert!(matches!(create(&connection, "anime"), Err(AppError::InvalidInput(_))));
        assert_eq!(list_with_usage(&connection).unwrap()[0].video_count, 0);
    }

    #[test]
    fn find_or_create_reuses_existing_tags() {
        let connection = test_support::connection();
        let first = find_or_create(&connection, "anime").unwrap();
        let second = find_or_create(&connection, "anime").unwrap();
        assert_eq!(first, second);
        assert_eq!(count(&connection).unwrap(), 1);
    }

    #[test]
    fn video_tags_are_listed_in_name_order_without_duplicates() {
        let connection = test_support::connection();
        let video = add_video(&connection, "a.mkv", 1.0);
        let zeta = find_or_create(&connection, "zeta").unwrap();
        let alpha = find_or_create(&connection, "alpha").unwrap();
        add_to_video(&connection, video.id, zeta.id).unwrap();
        add_to_video(&connection, video.id, alpha.id).unwrap();
        add_to_video(&connection, video.id, alpha.id).unwrap();

        assert_eq!(for_video(&connection, video.id).unwrap(), vec![alpha.clone(), zeta]);
        remove_from_video(&connection, video.id, alpha.id).unwrap();
        assert_eq!(for_video(&connection, video.id).unwrap().len(), 1);
    }

    #[test]
    fn folder_operations_only_touch_videos_inside_the_folder() {
        let connection = test_support::connection();
        add_video(&connection, &path(&["F", "a.mkv"]), 1.0);
        add_video(&connection, &path(&["F", "sub", "b.mkv"]), 1.0);
        let outside = add_video(&connection, &path(&["F2", "c.mkv"]), 1.0);
        let tag = find_or_create(&connection, "course").unwrap();
        add_to_video(&connection, outside.id, tag.id).unwrap();

        assert_eq!(add_to_folder(&connection, "F", tag.id).unwrap(), 2);
        assert_eq!(add_to_folder(&connection, "F", tag.id).unwrap(), 0);
        assert_eq!(remove_all_in_folder(&connection, "F").unwrap(), 2);
        assert_eq!(for_video(&connection, outside.id).unwrap().len(), 1);
    }

    #[test]
    fn management_operations_report_counts() {
        let connection = test_support::connection();
        let video = add_video(&connection, "a.mkv", 1.0);
        let used = find_or_create(&connection, "used").unwrap();
        find_or_create(&connection, "unused").unwrap();
        add_to_video(&connection, video.id, used.id).unwrap();

        let usage = list_with_usage(&connection).unwrap();
        assert_eq!(usage.iter().map(|tag| tag.video_count).collect::<Vec<_>>(), vec![0, 1]);
        assert_eq!(delete_unused(&connection).unwrap(), 1);
        assert_eq!(remove_from_all_videos(&connection, used.id).unwrap(), 1);
        assert_eq!(list_with_usage(&connection).unwrap()[0].video_count, 0);
        assert_eq!(delete_all(&connection).unwrap(), 1);
        assert!(matches!(delete(&connection, used.id), Err(AppError::NotFound(_))));
    }

    #[test]
    fn deleting_a_tag_cascades_to_assignments() {
        let connection = test_support::connection();
        let video = add_video(&connection, "a.mkv", 1.0);
        let tag = find_or_create(&connection, "gone").unwrap();
        add_to_video(&connection, video.id, tag.id).unwrap();
        delete(&connection, tag.id).unwrap();
        assert!(for_video(&connection, video.id).unwrap().is_empty());
    }
}
