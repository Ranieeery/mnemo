//! Groups of library folders in the sidebar (see `db::groups`), listed among the folders without a group (see
//! `folder_order`).

use crate::db::{Db, folders, groups};
use crate::domain::folder_name::normalize_group_name;
use crate::domain::models::LibraryGroup;
use crate::error::AppResult;

/// Creates a group at the end of the list and, with `folder_id`, moves that folder into it, all at once.
pub async fn create(db: &Db, name: String, folder_id: Option<i64>) -> AppResult<LibraryGroup> {
    let name = normalize_group_name(&name)?;
    db.call(move |connection| {
        let transaction = connection.transaction()?;
        let group = groups::create(&transaction, &name)?;
        if let Some(folder_id) = folder_id {
            folders::move_to_group(&transaction, folder_id, Some(group.id))?;
        }
        transaction.commit()?;
        Ok(group)
    })
    .await
}

pub async fn rename(db: &Db, id: i64, name: String) -> AppResult<LibraryGroup> {
    let name = normalize_group_name(&name)?;
    db.call(move |connection| {
        groups::rename(connection, id, &name)?;
        groups::find(connection, id)
    })
    .await
}

/// Deletes a group; its folders stay where it was, without a group. Returns how many folders it had.
pub async fn delete(db: &Db, id: i64) -> AppResult<i64> {
    db.call(move |connection| {
        let transaction = connection.transaction()?;
        let count = groups::delete(&transaction, id)?;
        transaction.commit()?;
        Ok(count)
    })
    .await
}

pub async fn set_collapsed(db: &Db, id: i64, collapsed: bool) -> AppResult<()> {
    db.call(move |connection| groups::set_collapsed(connection, id, collapsed))
        .await
}

/// Puts a folder at the end of a group (`None` takes it out, to the end of the list). The sort mode is kept: no
/// position was chosen.
pub async fn move_folder(db: &Db, folder_id: i64, group_id: Option<i64>) -> AppResult<()> {
    db.call(move |connection| {
        let transaction = connection.transaction()?;
        if let Some(group_id) = group_id {
            groups::find(&transaction, group_id)?;
        }
        folders::move_to_group(&transaction, folder_id, group_id)?;
        transaction.commit()?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::folder_order::LibraryFolderSort;
    use crate::domain::models::LibraryEntry;
    use crate::error::AppError;
    use crate::services::folder_order::{folder_sort, layout, list_folders, set_folder_sort};

    async fn library() -> (Db, i64) {
        let db = Db::open_in_memory().unwrap();
        let id = db
            .call(|connection| Ok(folders::add(connection, "Show")?.id))
            .await
            .unwrap();
        (db, id)
    }

    #[tokio::test]
    async fn creating_a_group_for_a_folder_moves_the_folder_into_it() {
        let (db, folder) = library().await;
        let group = create(&db, "  Series ".into(), Some(folder)).await.unwrap();
        assert_eq!(group.name, "Series");
        assert_eq!(list_folders(&db).await.unwrap()[0].group_id, Some(group.id));

        // Nothing is created when the folder is gone.
        assert!(matches!(
            create(&db, "Other".into(), Some(999)).await,
            Err(AppError::NotFound(_))
        ));
        assert_eq!(layout(&db).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn names_are_validated_on_create_and_rename() {
        let (db, _) = library().await;
        assert!(matches!(
            create(&db, "  ".into(), None).await,
            Err(AppError::InvalidInput(_))
        ));
        let group = create(&db, "Series".into(), None).await.unwrap();
        assert!(matches!(
            rename(&db, group.id, "\n".into()).await,
            Err(AppError::InvalidInput(_))
        ));
        assert_eq!(rename(&db, group.id, " Shows ".into()).await.unwrap().name, "Shows");
    }

    #[tokio::test]
    async fn moving_a_folder_keeps_the_sort_mode_and_needs_an_existing_group() {
        let (db, folder) = library().await;
        set_folder_sort(&db, LibraryFolderSort::NameDescending).await.unwrap();
        let group = create(&db, "Series".into(), None).await.unwrap();

        move_folder(&db, folder, Some(group.id)).await.unwrap();
        assert_eq!(list_folders(&db).await.unwrap()[0].group_id, Some(group.id));
        assert_eq!(folder_sort(&db).await.unwrap(), LibraryFolderSort::NameDescending);
        assert!(matches!(
            move_folder(&db, folder, Some(999)).await,
            Err(AppError::NotFound(_))
        ));

        move_folder(&db, folder, None).await.unwrap();
        assert_eq!(list_folders(&db).await.unwrap()[0].group_id, None);
        assert_eq!(folder_sort(&db).await.unwrap(), LibraryFolderSort::NameDescending);
    }

    #[tokio::test]
    async fn groups_collapse_and_delete_without_removing_folders() {
        let (db, folder) = library().await;
        let series = create(&db, "Series".into(), Some(folder)).await.unwrap();
        set_collapsed(&db, series.id, true).await.unwrap();
        let entries = layout(&db).await.unwrap();
        assert!(matches!(&entries[0], LibraryEntry::Group { group, .. } if group.collapsed));

        assert_eq!(delete(&db, series.id).await.unwrap(), 1);
        let folders = list_folders(&db).await.unwrap();
        assert_eq!(folders.len(), 1);
        assert_eq!(folders[0].group_id, None);
        assert!(matches!(delete(&db, series.id).await, Err(AppError::NotFound(_))));
    }
}
