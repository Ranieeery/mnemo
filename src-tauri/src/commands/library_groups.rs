use tauri::State;

use crate::domain::models::LibraryGroup;
use crate::error::AppResult;
use crate::services::library_groups;
use crate::state::AppState;

/// Creates a group at the end of the list; with `folder_id`, that folder moves into it at the same time.
#[tauri::command]
#[specta::specta]
pub async fn create_library_group(
    state: State<'_, AppState>,
    name: String,
    folder_id: Option<i64>,
) -> AppResult<LibraryGroup> {
    library_groups::create(&state.db, name, folder_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn rename_library_group(state: State<'_, AppState>, id: i64, name: String) -> AppResult<LibraryGroup> {
    library_groups::rename(&state.db, id, name).await
}

/// Deletes a group; its folders stay where it was in the list, without a group. Returns how many folders it had.
#[tauri::command]
#[specta::specta]
pub async fn delete_library_group(state: State<'_, AppState>, id: i64) -> AppResult<i64> {
    library_groups::delete(&state.db, id).await
}

/// Whether the group's folders are hidden in the expanded sidebar; kept between sessions.
#[tauri::command]
#[specta::specta]
pub async fn set_library_group_collapsed(state: State<'_, AppState>, id: i64, collapsed: bool) -> AppResult<()> {
    library_groups::set_collapsed(&state.db, id, collapsed).await
}

/// Puts a folder at the end of a group (`null` takes it out of its group, to the end of the list), keeping the sort
/// mode.
#[tauri::command]
#[specta::specta]
pub async fn move_library_folder_to_group(
    state: State<'_, AppState>,
    folder_id: i64,
    group_id: Option<i64>,
) -> AppResult<()> {
    library_groups::move_folder(&state.db, folder_id, group_id).await
}
