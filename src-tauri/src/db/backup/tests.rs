use rusqlite::Connection;

use super::format::{FORMAT_VERSION, LibraryFolderRecord};
use super::*;
use crate::db::videos::tests::path;
use crate::db::{folders, groups, hidden, history, layout, settings, tags, test_support, videos, watch};
use crate::domain::folder_color::FolderColor;
use crate::domain::folder_order::{LibraryFolderSort, flatten, library_entries};
use crate::domain::models::{AppSettings, ImportSummary, LayoutEntry};
use crate::domain::watch::DEFAULT_WATCHED_THRESHOLD;
use crate::error::AppError;

/// Shape of a real export produced by the legacy frontend (`exportLibraryData` with `SELECT *`).
const LEGACY_EXPORT: &str = r#"{
  "version": "1.0.0",
  "exportDate": "2025-06-01T12:00:00.000Z",
  "videos": [
    { "id": 1, "file_path": "D:\\Videos\\a.mkv", "title": "A", "description": null, "duration_seconds": 1200,
      "thumbnail_path": "C:\\thumbs\\a.jpg", "is_watched": 1, "watch_progress_seconds": 1100.5,
      "last_watched_at": "2025-05-01 10:00:00", "created_at": "2025-01-01 10:00:00",
      "updated_at": "2025-05-01 10:00:00" },
    { "id": 2, "file_path": "D:\\Videos\\b.mkv", "title": "B", "description": "notes", "duration_seconds": 600,
      "thumbnail_path": null, "is_watched": "false", "watch_progress_seconds": 0, "last_watched_at": null,
      "created_at": "2025-01-02 10:00:00", "updated_at": "2025-01-02 10:00:00" },
    { "id": 3, "file_path": "D:\\Videos\\c.mkv", "title": "C", "is_watched": true }
  ],
  "tags": [ { "id": 7, "name": "anime", "created_at": "2025-01-01 10:00:00" } ],
  "videoTags": [ { "id": 1, "video_id": 1, "tag_id": 7, "created_at": "2025-01-01 10:00:00" } ],
  "libraryFolders": [
    { "id": 1, "path": "D:\\Videos", "created_at": "2025-01-01 09:00:00", "custom_icon": "🎬" }
  ]
}"#;

fn parse(json: &str) -> LibraryFile {
    serde_json::from_str(json).unwrap()
}

#[test]
fn imports_a_legacy_export_with_every_boolean_shape() {
    // Regression (B6): `is_watched` was only restored when it was exactly `true`, and icons were dropped.
    let mut connection = test_support::connection();
    let summary = import(&mut connection, &parse(LEGACY_EXPORT)).unwrap();
    assert_eq!(
        summary,
        ImportSummary {
            folders: 1,
            videos: 3,
            tags: 1
        }
    );

    let watched: Vec<bool> = (1..=3)
        .map(|id| videos::get(&connection, id).unwrap().is_watched)
        .collect();
    assert_eq!(watched, vec![true, false, true]);
    assert_eq!(videos::get(&connection, 1).unwrap().watch_progress_seconds, 1100.5);
    assert_eq!(tags::for_video(&connection, 1).unwrap()[0].name, "anime");
    let folder = folders::list(&connection).unwrap().remove(0);
    assert_eq!(folder.custom_icon.as_deref(), Some("🎬"));
    // Exports from before 2.4 have no color: the default.
    assert_eq!(folder.icon_color, None);
}

#[test]
fn icon_colors_are_exported_and_unknown_ones_import_as_the_default() {
    let mut source = test_support::connection();
    import(&mut source, &parse(LEGACY_EXPORT)).unwrap();
    folders::set_appearance(&source, "D:\\Videos", Some("tv"), Some(FolderColor::Violet)).unwrap();
    let mut exported = export(&source).unwrap();
    assert_eq!(exported.library_folders[0].icon_color.as_deref(), Some("violet"));

    let mut target = test_support::connection();
    import(&mut target, &parse(&serde_json::to_string(&exported).unwrap())).unwrap();
    assert_eq!(folders::list(&target).unwrap()[0].icon_color, Some(FolderColor::Violet));

    exported.library_folders[0].icon_color = Some("chartreuse".into());
    import(&mut target, &exported).unwrap();
    assert_eq!(folders::list(&target).unwrap()[0].icon_color, None);
}

#[test]
fn custom_names_round_trip_and_older_or_invalid_ones_import_as_none() {
    let mut source = test_support::connection();
    import(&mut source, &parse(LEGACY_EXPORT)).unwrap();
    // Exports from before 2.5 have no custom name: the folder's own name.
    let legacy = folders::list(&source).unwrap().remove(0);
    assert_eq!((legacy.name, legacy.custom_name), (legacy.folder_name, None));
    let exported = export(&source).unwrap();
    assert!(!serde_json::to_string(&exported).unwrap().contains("custom_name"));

    folders::set_custom_name(&source, "D:\\Videos", Some("Movies")).unwrap();
    let mut exported = export(&source).unwrap();
    assert_eq!(exported.library_folders[0].custom_name.as_deref(), Some("Movies"));
    let mut target = test_support::connection();
    import(&mut target, &parse(&serde_json::to_string(&exported).unwrap())).unwrap();
    assert_eq!(folders::list(&target).unwrap()[0].name, "Movies");

    for invalid in [
        "   ",
        &"a".repeat(crate::domain::folder_name::MAX_FOLDER_NAME_CHARS + 1),
    ] {
        exported.library_folders[0].custom_name = Some(invalid.to_owned());
        import(&mut target, &exported).unwrap();
        assert_eq!(folders::list(&target).unwrap()[0].custom_name, None);
    }
    exported.library_folders[0].custom_name = Some("  Films\n".into());
    import(&mut target, &exported).unwrap();
    assert_eq!(folders::list(&target).unwrap()[0].custom_name.as_deref(), Some("Films"));
}

#[test]
fn groups_round_trip_and_older_or_broken_ones_import_without_groups() {
    let mut source = test_support::connection();
    import(&mut source, &parse(LEGACY_EXPORT)).unwrap();
    // Exports from before 2.5 have no groups.
    assert!(groups::list(&source).unwrap().is_empty());
    assert_eq!(folders::list(&source).unwrap()[0].group_id, None);

    let courses = groups::create(&source, "Courses").unwrap();
    let series = groups::create(&source, "Series").unwrap();
    groups::set_collapsed(&source, series.id, true).unwrap();
    let folder = folders::list(&source).unwrap().remove(0);
    let other = folders::add(&source, "E:\\Other").unwrap();
    folders::move_to_group(&source, folder.id, Some(series.id)).unwrap();
    // Folders and groups mixed in the list.
    layout::write(
        &source,
        &[
            LayoutEntry::Group {
                id: series.id,
                folders: vec![folder.id],
            },
            LayoutEntry::Folder { id: other.id },
            LayoutEntry::Group {
                id: courses.id,
                folders: vec![],
            },
        ],
    )
    .unwrap();
    let mut exported = export(&source).unwrap();

    let mut target = test_support::connection();
    import(&mut target, &parse(&serde_json::to_string(&exported).unwrap())).unwrap();
    assert_eq!(groups::list(&target).unwrap(), groups::list(&source).unwrap());
    assert_eq!(layout::read(&target).unwrap(), layout::read(&source).unwrap());
    assert_eq!(folders::list(&target).unwrap()[0].group_id, Some(series.id));

    // A group the app would refuse is left out, and its folders come without a group.
    let series_record = exported
        .library_groups
        .iter_mut()
        .find(|group| group.id == series.id)
        .unwrap();
    series_record.name = "  ".into();
    import(&mut target, &exported).unwrap();
    assert_eq!(groups::list(&target).unwrap(), [courses]);
    assert_eq!(folders::list(&target).unwrap()[0].group_id, None);

    // So does a folder pointing at a group the file does not have.
    exported.library_folders[0].group_id = Some(999);
    import(&mut target, &exported).unwrap();
    assert_eq!(folders::list(&target).unwrap()[0].group_id, None);
}

/// The folders in the custom order.
fn folder_paths(connection: &Connection) -> Vec<String> {
    let layout = layout::read(connection).unwrap();
    flatten(library_entries(
        &layout,
        folders::list(connection).unwrap(),
        groups::list(connection).unwrap(),
    ))
    .into_iter()
    .map(|folder| folder.path)
    .collect()
}

#[test]
fn the_custom_order_and_the_sort_mode_round_trip() {
    let source = test_support::connection();
    let first = folders::add(&source, "A").unwrap().id;
    let second = folders::add(&source, "B").unwrap().id;
    let third = folders::add(&source, "C").unwrap().id;
    layout::write(&source, &[third, first, second].map(|id| LayoutEntry::Folder { id })).unwrap();
    settings::set::<settings::FolderSort>(&source, LibraryFolderSort::RecentlyWatched).unwrap();
    let exported = export(&source).unwrap();
    assert_eq!(exported.library_folder_sort, Some(LibraryFolderSort::RecentlyWatched));

    let mut target = test_support::connection();
    import(&mut target, &parse(&serde_json::to_string(&exported).unwrap())).unwrap();
    assert_eq!(folder_paths(&target), ["C", "A", "B"]);
    assert_eq!(
        settings::get::<settings::FolderSort>(&target).unwrap(),
        LibraryFolderSort::RecentlyWatched
    );
}

#[test]
fn exports_without_an_order_or_a_mode_keep_the_previous_behavior() {
    let mut connection = test_support::connection();
    settings::set::<settings::FolderSort>(&connection, LibraryFolderSort::NameDescending).unwrap();
    let mut file = parse(LEGACY_EXPORT);
    file.library_folders = [
        (2, "E:\\Anime", "2025-02-01 09:00:00"),
        (1, "D:\\Videos", "2025-01-01 09:00:00"),
    ]
    .into_iter()
    .map(|(id, path, created_at)| LibraryFolderRecord {
        id,
        path: path.into(),
        created_at: Some(created_at.into()),
        custom_icon: None,
        icon_color: None,
        sort_order: None,
        custom_name: None,
        group_id: None,
    })
    .collect();
    import(&mut connection, &file).unwrap();
    // By date added, as they were listed before 2.4; the current mode is kept.
    assert_eq!(folder_paths(&connection), ["D:\\Videos", "E:\\Anime"]);
    assert_eq!(
        settings::get::<settings::FolderSort>(&connection).unwrap(),
        LibraryFolderSort::NameDescending
    );

    // Folders that have a position come first.
    file.library_folders[0].sort_order = Some(0);
    import(&mut connection, &file).unwrap();
    assert_eq!(folder_paths(&connection), ["E:\\Anime", "D:\\Videos"]);
}

#[test]
fn an_unknown_sort_mode_is_ignored_on_import() {
    let json = LEGACY_EXPORT.replacen('{', r#"{ "libraryFolderSort": "bySize","#, 1);
    let file = parse(&json);
    assert_eq!(file.library_folder_sort, None);
    let mut connection = test_support::connection();
    import(&mut connection, &file).unwrap();
    assert_eq!(
        settings::get::<settings::FolderSort>(&connection).unwrap(),
        LibraryFolderSort::Custom
    );
}

#[test]
fn export_then_import_round_trips_everything() {
    let mut source = test_support::connection();
    import(&mut source, &parse(LEGACY_EXPORT)).unwrap();
    watch::mark_watched(&mut source, 2).unwrap();
    folders::set_view_mode(
        &source,
        "D:\\Videos",
        Some(crate::domain::folder_view::FolderViewMode::Continuous),
    )
    .unwrap();
    settings::save(
        &source,
        &AppSettings {
            watched_threshold: 0.8,
            watch_folders: true,
        },
    )
    .unwrap();
    let exported = export(&source).unwrap();
    assert_eq!(exported.format_version, Some(FORMAT_VERSION));
    assert_eq!(exported.watch_history.len(), 1);

    let json = serde_json::to_string(&exported).unwrap();
    let mut target = test_support::connection();
    import(&mut target, &parse(&json)).unwrap();
    assert_eq!(export(&target).unwrap().videos, exported.videos);
    assert_eq!(export(&target).unwrap().watch_history, exported.watch_history);
    assert_eq!(folders::view_modes(&target).unwrap().len(), 1);
    assert_eq!(settings::load(&target).unwrap().watched_threshold, 0.8);
}

#[test]
fn hidden_folders_round_trip_and_older_exports_hide_nothing() {
    let source = test_support::connection();
    folders::add(&source, &path(&["Lib"])).unwrap();
    hidden::hide(&source, &path(&["Lib", "Private"])).unwrap();
    let mut exported = export(&source).unwrap();
    assert_eq!(exported.hidden_folders, [path(&["Lib", "Private"])]);
    // Outside every imported library folder: left out.
    exported.hidden_folders.push(path(&["Elsewhere", "Private"]));

    let mut target = test_support::connection();
    import(&mut target, &parse(&serde_json::to_string(&exported).unwrap())).unwrap();
    assert_eq!(hidden::list(&target).unwrap(), [path(&["Lib", "Private"])]);

    import(&mut target, &parse(LEGACY_EXPORT)).unwrap();
    assert!(hidden::list(&target).unwrap().is_empty());
}

/// Exports written by each 2.x minor before this one (2.0–2.2 share a shape; 2.5 is what `export` writes now), with
/// the `watchFolders` each should import: files from before 2.3 have none and import the default.
const EXPORTS_BY_VERSION: &[(&str, &str, bool)] = &[
    ("2.2", include_str!("fixtures/2.2.json"), true),
    ("2.3", include_str!("fixtures/2.3.json"), false),
    ("2.4", include_str!("fixtures/2.4.json"), false),
];

#[test]
fn imports_exports_from_every_2_x_minor() {
    // Regression: `watchFolders` (2.3) had no default, so exports from 2.0–2.2 failed with "missing field".
    let mut current = test_support::connection();
    import(&mut current, &parse(EXPORTS_BY_VERSION[2].1)).unwrap();
    let current = serde_json::to_string(&export(&current).unwrap()).unwrap();
    let all = EXPORTS_BY_VERSION
        .iter()
        .copied()
        .chain([("2.5", current.as_str(), false)]);

    for (version, json, watch_folders) in all {
        let mut connection = test_support::connection();
        let summary = import(&mut connection, &parse(json)).unwrap_or_else(|error| panic!("{version}: {error}"));
        assert_eq!(
            summary,
            ImportSummary {
                folders: 1,
                videos: 2,
                tags: 1
            },
            "{version}"
        );
        let settings = settings::load(&connection).unwrap();
        assert_eq!(settings.watched_threshold, 0.8, "{version}");
        assert_eq!(settings.watch_folders, watch_folders, "{version}");
        assert!(videos::get(&connection, 1).unwrap().is_watched, "{version}");
        assert_eq!(tags::for_video(&connection, 1).unwrap()[0].name, "anime", "{version}");
        assert_eq!(folders::view_modes(&connection).unwrap().len(), 1, "{version}");
        assert_eq!(
            history::list_page(&connection, None, 10).unwrap().entries.len(),
            1,
            "{version}"
        );
    }
}

#[test]
fn invalid_settings_import_as_the_default() {
    let mut connection = test_support::connection();
    let json = EXPORTS_BY_VERSION[1].1.replace(
        r#""watchedThreshold": 0.8, "watchFolders": false"#,
        r#""watchedThreshold": 0.3, "watchFolders": "no""#,
    );
    import(&mut connection, &parse(&json)).unwrap();
    assert_eq!(
        settings::load(&connection).unwrap(),
        AppSettings {
            watched_threshold: DEFAULT_WATCHED_THRESHOLD,
            watch_folders: true,
        }
    );
}

#[test]
fn records_the_app_would_refuse_are_left_out() {
    // Regression: one bad record (a hand-edited file) failed the whole import, and an unreadable `watched_at` was
    // stored and then broke every history page.
    let mut file = parse(EXPORTS_BY_VERSION[1].1);
    file.folder_settings[0].view_mode = "grid".into();
    let mut duplicate = file.videos[1].clone();
    duplicate.id = 3;
    duplicate.watch_progress_seconds = Some(-5.0);
    file.videos.push(duplicate);
    file.videos[1].watch_progress_seconds = Some(-5.0);
    for (id, name) in [(8, " Anime "), (9, "   ")] {
        file.tags.push(super::format::TagRecord {
            id,
            name: name.into(),
            created_at: None,
        });
    }
    for (video_id, tag_id) in [(1, 8), (2, 8), (2, 9), (999, 7), (1, 999)] {
        file.video_tags.push(super::format::VideoTagRecord {
            id: None,
            video_id,
            tag_id,
            created_at: None,
        });
    }
    let entry = file.watch_history[0].clone();
    for (id, video_id, watched_at) in [
        (2, 1, "yesterday"),
        (3, 999, "2025-08-02 10:00:00"),
        (4, 2, "2025-08-03T10:00:00Z"),
    ] {
        file.watch_history.push(super::format::WatchHistoryRecord {
            id,
            video_id,
            watched_at: Some(watched_at.into()),
            ..entry.clone()
        });
    }

    let mut connection = test_support::connection();
    let summary = import(&mut connection, &file).unwrap();

    assert_eq!((summary.videos, summary.tags), (2, 1));
    assert!(folders::view_modes(&connection).unwrap().is_empty());
    assert_eq!(videos::get(&connection, 2).unwrap().watch_progress_seconds, 0.0);
    // " Anime " is the same tag as "anime": both links point at it, once each.
    assert_eq!(tags::for_video(&connection, 1).unwrap().len(), 1);
    assert_eq!(tags::for_video(&connection, 2).unwrap()[0].name, "anime");
    let page = history::list_page(&connection, None, 10).unwrap();
    let watched: Vec<&str> = page.entries.iter().map(|entry| entry.watched_at.as_str()).collect();
    assert_eq!(watched, ["2025-08-03T10:00:00Z", "2025-08-01T10:00:00Z"]);
    assert_eq!(history::daily_totals(&connection, 36500).unwrap().len(), 2);
}

#[test]
fn failed_import_keeps_the_current_library() {
    // Regression (B6): the legacy import deleted everything before inserting, so a failure lost the library.
    let mut connection = test_support::connection();
    import(&mut connection, &parse(LEGACY_EXPORT)).unwrap();
    let mut broken = parse(LEGACY_EXPORT);
    let folder = broken.library_folders[0].clone();
    broken.library_folders.push(folder);

    assert!(import(&mut connection, &broken).is_err());
    assert_eq!(export(&connection).unwrap().videos.len(), 3);
}

#[test]
fn rejects_files_that_are_not_library_exports() {
    assert!(serde_json::from_str::<LibraryFile>(r#"{ "hello": "world" }"#).is_err());

    let mut newer = parse(LEGACY_EXPORT);
    newer.format_version = Some(FORMAT_VERSION + 1);
    assert!(matches!(newer.validate(), Err(AppError::ImportFormat(_))));

    let mut unversioned = parse(LEGACY_EXPORT);
    unversioned.version = None;
    assert!(matches!(unversioned.validate(), Err(AppError::ImportFormat(_))));

    let mut foreign = parse(LEGACY_EXPORT);
    foreign.format = Some("other-app".into());
    assert!(matches!(foreign.validate(), Err(AppError::ImportFormat(_))));
}
