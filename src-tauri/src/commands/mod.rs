//! IPC commands: a thin layer that adapts services to Tauri. TypeScript bindings are generated from this list.

pub mod events;
mod library;
mod library_groups;
mod media;
mod search;
mod settings;
mod system;
mod tags;
mod updates;
mod videos;
pub mod window;

use tauri_specta::{Builder, collect_commands, collect_events};

use crate::domain::folder_color::FolderColor;
use crate::domain::folder_name::MAX_FOLDER_NAME_CHARS;
use crate::domain::layout::{DEFAULT_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH, SidebarPreferences};
use crate::domain::models::PlayerPreferences;
use crate::domain::playable_copy::{MAX_PLAYABLE_COPY_LIMIT_GB, MIN_PLAYABLE_COPY_LIMIT_GB, PlayableCopySettings};
use crate::domain::player::{
    MAX_PLAYBACK_SPEED, MAX_UP_NEXT_WIDTH, MIN_PLAYBACK_SPEED, MIN_UP_NEXT_WIDTH, PLAYBACK_SPEED_STEP,
};
use crate::domain::shortcuts::{KeyboardShortcuts, MAX_KEYS_PER_SHORTCUT, NAMED_SHORTCUT_KEYS, RESERVED_SHORTCUT_KEYS};
use crate::domain::subtitle_style::{
    MAX_SUBTITLE_POSITION, MAX_SUBTITLE_SIZE, MIN_SUBTITLE_SIZE, SUBTITLE_SIZE_STEP, SubtitleStyle,
};
use crate::domain::tags::MAX_TAG_NAME_CHARS;
use crate::domain::watch::{
    DEFAULT_WATCHED_THRESHOLD, MAX_WATCHED_THRESHOLD, MIN_WATCHED_THRESHOLD, WATCHED_THRESHOLD_STEP,
};
use crate::domain::zoom::{ZOOM_IN_KEYS, ZOOM_OUT_KEYS, ZOOM_RESET_KEYS};

pub fn builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .events(collect_events![
            events::ProcessingStatusChanged,
            events::ProcessingFinished,
            events::LibraryChanged,
            events::LibraryFoldersChanged,
            events::StartupSyncFailed,
            events::UpdateAvailable,
            events::WindowModeChanged
        ])
        .commands(collect_commands![
            library::list_library_folders,
            library::get_library_folder_sort,
            library::set_library_folder_sort,
            library::get_library_layout,
            library::arrange_library,
            library::set_library_folder_pinned,
            library::set_library_group_pinned,
            library_groups::create_library_group,
            library_groups::rename_library_group,
            library_groups::delete_library_group,
            library_groups::set_library_group_collapsed,
            library_groups::move_library_folder_to_group,
            library::get_library_folder_statuses,
            library::add_library_folder,
            library::remove_library_folder,
            library::check_folder_relocation,
            library::relocate_library_folder,
            library::set_library_folder_appearance,
            library::rename_library_folder,
            library::recent_folder_icons,
            library::set_folder_view_mode,
            library::list_hidden_folders,
            library::set_folder_hidden,
            library::browse_folder,
            library::get_folder_summary,
            library::list_playlist,
            library::get_home,
            videos::get_video,
            videos::update_video_details,
            videos::set_watched,
            videos::save_progress,
            videos::set_folder_watched,
            videos::reset_all_watch_status,
            videos::list_watch_history,
            videos::get_watch_totals,
            tags::list_tags,
            tags::create_tag,
            tags::get_video_tags,
            tags::add_tag_to_video,
            tags::remove_tag_from_video,
            tags::add_tag_to_folder,
            tags::remove_all_tags_from_folder,
            tags::delete_tag,
            tags::remove_tag_from_all_videos,
            tags::delete_all_tags,
            tags::delete_unused_tags,
            search::search_library,
            search::search_folder,
            media::media_tools_status,
            media::process_folders,
            media::cancel_processing,
            media::get_processing_status,
            media::set_video_thumbnail,
            media::find_subtitle,
            media::list_media_tracks,
            media::extract_subtitle,
            media::check_playable_copy,
            media::make_playable_copy,
            media::cancel_playable_copy,
            settings::get_settings,
            settings::update_settings,
            settings::get_player_preferences,
            settings::update_player_preferences,
            settings::get_sidebar_preferences,
            settings::update_sidebar_preferences,
            settings::get_keyboard_shortcuts,
            settings::update_keyboard_shortcuts,
            settings::get_subtitle_style,
            settings::update_subtitle_style,
            settings::get_playable_copy_settings,
            settings::update_playable_copy_settings,
            settings::get_playable_copies_usage,
            settings::clear_playable_copies,
            settings::get_library_stats,
            settings::export_library,
            settings::import_library,
            settings::get_database_info,
            settings::list_orphaned_videos,
            settings::clean_orphaned_videos,
            settings::list_missing_videos,
            settings::clean_missing_videos,
            system::open_externally,
            system::reveal_in_file_manager,
            updates::get_update_status,
            updates::set_automatic_update_checks,
            updates::check_for_updates,
            updates::open_release_page,
            window::get_window_mode,
            window::set_window_pinned,
            window::enter_mini_player,
            window::exit_mini_player,
            window::set_mini_player_aspect,
            window::change_zoom,
        ])
        .constant("DEFAULT_WATCHED_THRESHOLD", DEFAULT_WATCHED_THRESHOLD)
        .constant("MIN_WATCHED_THRESHOLD", MIN_WATCHED_THRESHOLD)
        .constant("MAX_WATCHED_THRESHOLD", MAX_WATCHED_THRESHOLD)
        .constant("WATCHED_THRESHOLD_STEP", WATCHED_THRESHOLD_STEP)
        .constant("MIN_PLAYBACK_SPEED", MIN_PLAYBACK_SPEED)
        .constant("MAX_PLAYBACK_SPEED", MAX_PLAYBACK_SPEED)
        .constant("PLAYBACK_SPEED_STEP", PLAYBACK_SPEED_STEP)
        .constant("MIN_UP_NEXT_WIDTH", MIN_UP_NEXT_WIDTH)
        .constant("MAX_UP_NEXT_WIDTH", MAX_UP_NEXT_WIDTH)
        .constant("DEFAULT_PLAYER_PREFERENCES", PlayerPreferences::default())
        .constant("FOLDER_COLORS", FolderColor::ALL)
        .constant("MAX_FOLDER_NAME_CHARS", MAX_FOLDER_NAME_CHARS)
        .constant("MAX_TAG_NAME_CHARS", MAX_TAG_NAME_CHARS)
        .constant("DEFAULT_SIDEBAR_WIDTH", DEFAULT_SIDEBAR_WIDTH)
        .constant("MIN_SIDEBAR_WIDTH", MIN_SIDEBAR_WIDTH)
        .constant("MAX_SIDEBAR_WIDTH", MAX_SIDEBAR_WIDTH)
        .constant("DEFAULT_SIDEBAR_PREFERENCES", SidebarPreferences::default())
        .constant("DEFAULT_KEYBOARD_SHORTCUTS", KeyboardShortcuts::default())
        .constant("RESERVED_SHORTCUT_KEYS", RESERVED_SHORTCUT_KEYS)
        .constant("ZOOM_IN_KEYS", ZOOM_IN_KEYS)
        .constant("ZOOM_OUT_KEYS", ZOOM_OUT_KEYS)
        .constant("ZOOM_RESET_KEYS", ZOOM_RESET_KEYS)
        .constant("MAX_KEYS_PER_SHORTCUT", MAX_KEYS_PER_SHORTCUT)
        .constant("NAMED_SHORTCUT_KEYS", NAMED_SHORTCUT_KEYS)
        .constant("DEFAULT_SUBTITLE_STYLE", SubtitleStyle::default())
        .constant("MIN_SUBTITLE_SIZE", MIN_SUBTITLE_SIZE)
        .constant("MAX_SUBTITLE_SIZE", MAX_SUBTITLE_SIZE)
        .constant("SUBTITLE_SIZE_STEP", SUBTITLE_SIZE_STEP)
        .constant("MAX_SUBTITLE_POSITION", MAX_SUBTITLE_POSITION)
        .constant("DEFAULT_PLAYABLE_COPY_SETTINGS", PlayableCopySettings::default())
        .constant("MIN_PLAYABLE_COPY_LIMIT_GB", MIN_PLAYABLE_COPY_LIMIT_GB)
        .constant("MAX_PLAYABLE_COPY_LIMIT_GB", MAX_PLAYABLE_COPY_LIMIT_GB)
        // Every integer crossing IPC is a row id, a count, a byte size or a time in milliseconds, all far below 2^53,
        // so JavaScript numbers represent them exactly.
        .dangerously_cast_bigints_to_number()
}

#[cfg(test)]
mod tests {
    use specta_typescript::Typescript;

    use super::*;

    /// Path of the generated bindings, relative to `src-tauri`.
    const BINDINGS_PATH: &str = "../src/shared/ipc/bindings.ts";

    /// Regenerates the TypeScript bindings. Runs with `cargo test`, so they never drift from the commands.
    #[test]
    fn export_typescript_bindings() {
        builder()
            .export(
                Typescript::default()
                    .header("// Generated by tauri-specta from src-tauri/src/commands. Do not edit.\n"),
                BINDINGS_PATH,
            )
            .unwrap();
    }
}
