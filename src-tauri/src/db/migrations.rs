//! Versioned schema migrations (tracked in `PRAGMA user_version`). Never edit a released migration: add a new one.

use rusqlite::{Connection, Transaction};
use rusqlite_migration::{HookResult, M, Migrations};

use crate::error::AppResult;

/// Baseline: the schema written by the legacy frontend (`database.ts`). `IF NOT EXISTS` keeps legacy databases
/// untouched; the hook then adds the columns that older legacy versions created later with ad-hoc `ALTER TABLE`s.
const BASELINE: &str = r#"
CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    duration_seconds INTEGER,
    thumbnail_path TEXT,
    is_watched BOOLEAN DEFAULT FALSE,
    watch_progress_seconds INTEGER DEFAULT 0,
    last_watched_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS video_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
    UNIQUE(video_id, tag_id)
);
CREATE TABLE IF NOT EXISTS library_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    custom_icon TEXT
);
CREATE TABLE IF NOT EXISTS watch_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    watch_duration_seconds INTEGER DEFAULT 0,
    FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE
);
"#;

/// Columns that legacy versions added after creating their tables.
const LEGACY_LATE_COLUMNS: &[(&str, &str, &str)] = &[
    ("videos", "is_watched", "BOOLEAN DEFAULT FALSE"),
    ("videos", "watch_progress_seconds", "INTEGER DEFAULT 0"),
    ("videos", "last_watched_at", "DATETIME"),
    ("library_folders", "custom_icon", "TEXT"),
];

fn add_missing_legacy_columns(transaction: &Transaction) -> HookResult {
    for (table, column, definition) in LEGACY_LATE_COLUMNS {
        let exists: bool = transaction.query_row(
            "SELECT EXISTS (SELECT 1 FROM pragma_table_info(?1) WHERE name = ?2)",
            [table, column],
            |row| row.get(0),
        )?;
        if !exists {
            transaction.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"))?;
        }
    }
    Ok(())
}

/// Cleans data the legacy frontend could leave behind, adds the indexes for frequent queries and the tables of the
/// features approved during the refactor (adjustable watched threshold, per-folder view mode).
const INDEXES_CLEANUP_AND_SETTINGS: &str = r#"
DELETE FROM video_tags
WHERE video_id NOT IN (SELECT id FROM videos) OR tag_id NOT IN (SELECT id FROM tags);
DELETE FROM watch_history WHERE video_id NOT IN (SELECT id FROM videos);

-- The legacy SQL plugin sometimes stored booleans as the text 'true'/'false'.
UPDATE videos SET is_watched = CASE WHEN lower(CAST(is_watched AS TEXT)) IN ('1', 'true') THEN 1 ELSE 0 END;
UPDATE videos SET watch_progress_seconds = 0 WHERE watch_progress_seconds IS NULL;

CREATE INDEX IF NOT EXISTS idx_videos_watch_status ON videos (is_watched, last_watched_at);
CREATE INDEX IF NOT EXISTS idx_videos_last_watched_at ON videos (last_watched_at);
CREATE INDEX IF NOT EXISTS idx_video_tags_tag_id ON video_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_video_id ON watch_history (video_id);

CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE folder_settings (
    path TEXT PRIMARY KEY,
    view_mode TEXT NOT NULL CHECK (view_mode IN ('folders', 'continuous'))
);
"#;

/// Version 2.1: the history screen pages and sums the watch history by date.
const WATCH_HISTORY_DATE_INDEX: &str =
    "CREATE INDEX IF NOT EXISTS idx_watch_history_watched_at ON watch_history (watched_at);";

/// Version 2.3: folder watching. A file's size and a hash of its head and tail recognize it after a rename or move,
/// and a video whose file disappeared is marked instead of deleted, so it keeps its data if the file comes back.
const FILE_PRESENCE: &str = r#"
ALTER TABLE videos ADD COLUMN file_size INTEGER;
ALTER TABLE videos ADD COLUMN fingerprint TEXT;
ALTER TABLE videos ADD COLUMN missing_since DATETIME;
CREATE INDEX idx_videos_file_size ON videos (file_size);
CREATE INDEX idx_videos_missing_since ON videos (missing_since) WHERE missing_since IS NOT NULL;
"#;

/// Version 2.4: a library folder's icon can have a color, stored by its token name (`NULL` is the default color).
const FOLDER_ICON_COLOR: &str = "ALTER TABLE library_folders ADD COLUMN icon_color TEXT;";

/// Version 2.4: library folders can be put in a custom order. It starts as the order they were listed in before
/// (when they were added), so nothing moves on upgrade.
const FOLDER_SORT_ORDER: &str = r#"
ALTER TABLE library_folders ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE library_folders SET sort_order = ranked.position
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) - 1 AS position FROM library_folders) AS ranked
WHERE ranked.id = library_folders.id;
"#;

/// Version 2.4: folders hidden from the home page and the history. Each one keeps the range of paths inside it
/// (`FolderBounds`), so filtering videos is a plain range comparison.
const HIDDEN_FOLDERS: &str = r#"
CREATE TABLE hidden_folders (
    path TEXT PRIMARY KEY,
    lower_bound TEXT NOT NULL,
    upper_bound TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_hidden_folders_lower_bound ON hidden_folders (lower_bound);
"#;

/// Version 2.5: a library folder can be renamed in the app (its folder on disk never is). `NULL` shows the folder's
/// own name, so every existing folder keeps the name it had.
const FOLDER_CUSTOM_NAME: &str = "ALTER TABLE library_folders ADD COLUMN custom_name TEXT;";

/// Version 2.5: library folders can be put in groups. A folder belongs to at most one; deleting a group leaves its
/// folders without one. Existing folders start without a group, which lists them as before.
const LIBRARY_GROUPS: &str = r#"
CREATE TABLE library_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    collapsed INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE library_folders ADD COLUMN group_id INTEGER REFERENCES library_groups (id) ON DELETE SET NULL;
CREATE INDEX idx_library_folders_group_id ON library_folders (group_id);
"#;

/// Version 2.5: folders without a group and groups share one list, so `sort_order` numbers them together, and the
/// folders of each group on their own. The list keeps the order it was shown in: the folders without a group, then
/// the groups.
const SHARED_LIBRARY_ORDER: &str = r#"
UPDATE library_folders SET sort_order = ranked.position
FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY sort_order, created_at, id) - 1 AS position
      FROM library_folders) AS ranked
WHERE ranked.id = library_folders.id;
UPDATE library_groups SET sort_order = ranked.position + (SELECT COUNT(*) FROM library_folders WHERE group_id IS NULL)
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, created_at, id) - 1 AS position FROM library_groups) AS ranked
WHERE ranked.id = library_groups.id;
"#;

fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up_with_hook(BASELINE, add_missing_legacy_columns),
        M::up(INDEXES_CLEANUP_AND_SETTINGS),
        M::up(WATCH_HISTORY_DATE_INDEX),
        M::up(FILE_PRESENCE),
        M::up(FOLDER_ICON_COLOR),
        M::up(FOLDER_SORT_ORDER),
        M::up(HIDDEN_FOLDERS),
        M::up(FOLDER_CUSTOM_NAME),
        M::up(LIBRARY_GROUPS),
        M::up(SHARED_LIBRARY_ORDER),
    ])
}

pub fn run(connection: &mut Connection) -> AppResult<()> {
    migrations().to_latest(connection)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::params;

    use super::*;

    /// Schema of the first legacy releases, before the columns added through `ALTER TABLE`.
    const OLDEST_LEGACY_SCHEMA: &str = r#"
    CREATE TABLE videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      duration_seconds INTEGER,
      thumbnail_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE video_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
      UNIQUE(video_id, tag_id)
    );
    CREATE TABLE library_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE watch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL,
      watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      watch_duration_seconds INTEGER DEFAULT 0,
      FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE
    );
    "#;

    /// The latest legacy schema, exactly as found in a real `mnemo.db` (columns appended by `ALTER TABLE`).
    const LATEST_LEGACY_SCHEMA_ADDITIONS: &str = r#"
    ALTER TABLE videos ADD COLUMN is_watched BOOLEAN DEFAULT FALSE;
    ALTER TABLE videos ADD COLUMN watch_progress_seconds INTEGER DEFAULT 0;
    ALTER TABLE videos ADD COLUMN last_watched_at DATETIME;
    ALTER TABLE library_folders ADD COLUMN custom_icon TEXT;
    "#;

    fn legacy_database(latest: bool) -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(OLDEST_LEGACY_SCHEMA).unwrap();
        if latest {
            connection.execute_batch(LATEST_LEGACY_SCHEMA_ADDITIONS).unwrap();
        }
        connection
            .execute_batch(
                r#"
                INSERT INTO library_folders (id, path, created_at) VALUES (1, 'D:\Videos', '2025-01-01 10:00:00');
                INSERT INTO videos (id, file_path, title, description, duration_seconds, thumbnail_path, created_at)
                VALUES (1, 'D:\Videos\a.mkv', 'A', 'first', 1200, 'C:\thumbs\a.jpg', '2025-01-02 10:00:00'),
                       (2, 'D:\Videos\b.mkv', 'B', NULL, 600, NULL, '2025-01-03 10:00:00');
                INSERT INTO tags (id, name) VALUES (1, 'anime');
                INSERT INTO video_tags (video_id, tag_id) VALUES (1, 1);
                INSERT INTO watch_history (video_id, watch_duration_seconds) VALUES (1, 1100);
                "#,
            )
            .unwrap();
        connection
    }

    fn user_version(connection: &Connection) -> i64 {
        connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap()
    }

    fn columns(connection: &Connection, table: &str) -> Vec<String> {
        let mut statement = connection.prepare("SELECT name FROM pragma_table_info(?1)").unwrap();
        statement
            .query_map([table], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    fn assert_legacy_data_preserved(connection: &Connection) {
        let (title, description, duration, thumbnail): (String, Option<String>, i64, Option<String>) = connection
            .query_row(
                "SELECT title, description, duration_seconds, thumbnail_path FROM videos WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(title, "A");
        assert_eq!(description.as_deref(), Some("first"));
        assert_eq!(duration, 1200);
        assert_eq!(thumbnail.as_deref(), Some("C:\\thumbs\\a.jpg"));

        let counts: (i64, i64, i64, i64, i64) = connection
            .query_row(
                "SELECT (SELECT COUNT(*) FROM videos), (SELECT COUNT(*) FROM tags), (SELECT COUNT(*) FROM video_tags),
                        (SELECT COUNT(*) FROM library_folders), (SELECT COUNT(*) FROM watch_history)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .unwrap();
        assert_eq!(counts, (2, 1, 1, 1, 1));
    }

    fn table_counts(connection: &Connection) -> Vec<i64> {
        ["videos", "tags", "video_tags", "library_folders", "watch_history"]
            .iter()
            .map(|table| {
                connection
                    .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))
                    .unwrap()
            })
            .collect()
    }

    /// Migrates a copy of a real database written by the legacy app. Never point it at the live file:
    /// `MNEMO_LEGACY_DB=/path/to/copy/mnemo.db cargo test -- --ignored migrates_a_real_legacy_database`
    #[test]
    #[ignore = "needs MNEMO_LEGACY_DB pointing to a copy of a legacy mnemo.db"]
    fn migrates_a_real_legacy_database() {
        let path = std::env::var("MNEMO_LEGACY_DB").unwrap();
        let mut connection = Connection::open(path).unwrap();
        let before = table_counts(&connection);
        run(&mut connection).unwrap();
        assert_eq!(user_version(&connection), 10);
        let after = table_counts(&connection);
        assert_eq!(after[0], before[0], "videos");
        assert_eq!(after[1], before[1], "tags");
        assert_eq!(after[3], before[3], "library folders");
        let text_flags: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM videos WHERE typeof(is_watched) <> 'integer'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(text_flags, 0);
    }

    #[test]
    fn migration_definitions_are_valid() {
        migrations().validate().unwrap();
    }

    #[test]
    fn creates_the_full_schema_on_an_empty_database() {
        let mut connection = Connection::open_in_memory().unwrap();
        run(&mut connection).unwrap();
        assert_eq!(user_version(&connection), 10);
        for table in [
            "videos",
            "tags",
            "video_tags",
            "library_folders",
            "watch_history",
            "app_settings",
            "hidden_folders",
            "library_groups",
        ] {
            assert!(!columns(&connection, table).is_empty(), "{table}");
        }
        assert!(columns(&connection, "folder_settings").contains(&"view_mode".to_owned()));
    }

    #[test]
    fn legacy_videos_start_without_file_identity_and_present() {
        let mut connection = legacy_database(true);
        run(&mut connection).unwrap();
        let unknown: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM videos WHERE file_size IS NULL AND fingerprint IS NULL AND missing_since IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let total: i64 = connection
            .query_row("SELECT COUNT(*) FROM videos", [], |row| row.get(0))
            .unwrap();
        assert_eq!(unknown, total);
        assert_legacy_data_preserved(&connection);
    }

    #[test]
    fn legacy_library_folders_keep_their_icon_and_start_with_the_default_color() {
        let mut connection = legacy_database(true);
        connection
            .execute("UPDATE library_folders SET custom_icon = '🎬' WHERE id = 1", params![])
            .unwrap();
        run(&mut connection).unwrap();
        let (icon, color): (Option<String>, Option<String>) = connection
            .query_row(
                "SELECT custom_icon, icon_color FROM library_folders WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(icon.as_deref(), Some("🎬"));
        assert_eq!(color, None);
        assert_legacy_data_preserved(&connection);
    }

    #[test]
    fn groups_join_the_list_after_the_folders_without_a_group() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations().to_version(&mut connection, 9).unwrap();
        // One sequence for every folder, and one for the groups.
        connection
            .execute_batch(
                "INSERT INTO library_groups (id, name, sort_order) VALUES (1, 'Courses', 1), (2, 'Series', 0);
                 INSERT INTO library_folders (id, path, sort_order, group_id) VALUES
                     (1, 'A', 0, NULL), (2, 'B', 1, 2), (3, 'C', 2, NULL), (4, 'D', 3, 2), (5, 'E', 4, 1);",
            )
            .unwrap();
        run(&mut connection).unwrap();

        let positions = |sql: &str| -> Vec<(i64, i64)> {
            let mut statement = connection.prepare(sql).unwrap();
            statement
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap()
        };
        assert_eq!(
            positions("SELECT id, sort_order FROM library_folders ORDER BY id"),
            [(1, 0), (2, 0), (3, 1), (4, 1), (5, 0)]
        );
        assert_eq!(
            positions("SELECT id, sort_order FROM library_groups ORDER BY id"),
            [(1, 3), (2, 2)]
        );
    }

    #[test]
    fn legacy_library_folders_start_without_a_group_and_deleting_a_group_keeps_its_folders() {
        let mut connection = legacy_database(true);
        run(&mut connection).unwrap();
        let grouped: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM library_folders WHERE group_id IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(grouped, 0);

        connection
            .execute_batch(
                "INSERT INTO library_groups (id, name) VALUES (1, 'Series');
                 UPDATE library_folders SET group_id = 1;
                 DELETE FROM library_groups;",
            )
            .unwrap();
        let ungrouped: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM library_folders WHERE group_id IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(ungrouped > 0);
        assert_legacy_data_preserved(&connection);
    }

    #[test]
    fn legacy_library_folders_start_without_a_custom_name() {
        let mut connection = legacy_database(true);
        run(&mut connection).unwrap();
        let named: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM library_folders WHERE custom_name IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(named, 0);
        assert_legacy_data_preserved(&connection);
    }

    #[test]
    fn legacy_library_folders_keep_the_order_they_were_listed_in() {
        let mut connection = legacy_database(true);
        connection
            .execute_batch(
                r#"
                INSERT INTO library_folders (id, path, created_at) VALUES (2, 'E:\Anime', '2024-06-01 10:00:00');
                INSERT INTO library_folders (id, path, created_at) VALUES (3, 'F:\Movies', '2025-01-01 10:00:00');
                "#,
            )
            .unwrap();
        run(&mut connection).unwrap();
        let mut statement = connection
            .prepare("SELECT id, sort_order FROM library_folders ORDER BY sort_order")
            .unwrap();
        let order: Vec<(i64, i64)> = statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        // Folders 1 and 3 were added at the same time: the older id first, as they were listed before.
        assert_eq!(order, [(2, 0), (1, 1), (3, 2)]);
    }

    #[test]
    fn indexes_the_watch_history_by_date() {
        let mut connection = legacy_database(true);
        run(&mut connection).unwrap();
        let indexed: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_watch_history_watched_at'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(indexed, 1);
        assert_legacy_data_preserved(&connection);
    }

    #[test]
    fn upgrades_the_latest_legacy_schema_without_losing_data() {
        let mut connection = legacy_database(true);
        run(&mut connection).unwrap();
        assert_eq!(user_version(&connection), 10);
        assert_legacy_data_preserved(&connection);
    }

    #[test]
    fn upgrades_the_oldest_legacy_schema_adding_missing_columns() {
        let mut connection = legacy_database(false);
        run(&mut connection).unwrap();

        let video_columns = columns(&connection, "videos");
        for column in ["is_watched", "watch_progress_seconds", "last_watched_at"] {
            assert!(video_columns.contains(&column.to_owned()), "{column}");
        }
        assert!(columns(&connection, "library_folders").contains(&"custom_icon".to_owned()));
        assert_legacy_data_preserved(&connection);

        let (watched, progress): (i64, f64) = connection
            .query_row(
                "SELECT is_watched, watch_progress_seconds FROM videos WHERE id = 2",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!((watched, progress), (0, 0.0));
    }

    #[test]
    fn normalizes_text_booleans_written_by_the_legacy_plugin() {
        let connection = legacy_database(true);
        connection
            .execute("UPDATE videos SET is_watched = 'false' WHERE id = 1", [])
            .unwrap();
        connection
            .execute("UPDATE videos SET is_watched = 'true' WHERE id = 2", [])
            .unwrap();
        let mut connection = connection;
        run(&mut connection).unwrap();

        let flags: Vec<(i64, String)> = connection
            .prepare("SELECT is_watched, typeof(is_watched) FROM videos ORDER BY id")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(flags, vec![(0, "integer".to_owned()), (1, "integer".to_owned())]);
    }

    #[test]
    fn removes_orphaned_relations() {
        let connection = legacy_database(true);
        connection
            .execute_batch(
                // The bundled SQLite enforces foreign keys by default; older legacy databases were not so strict.
                "PRAGMA foreign_keys = OFF;
                 INSERT INTO video_tags (video_id, tag_id) VALUES (99, 1);
                 INSERT INTO watch_history (video_id) VALUES (99);
                 PRAGMA foreign_keys = ON;",
            )
            .unwrap();
        let mut connection = connection;
        run(&mut connection).unwrap();
        assert_legacy_data_preserved(&connection);
    }

    #[test]
    fn running_twice_is_a_no_op() {
        let mut connection = legacy_database(true);
        run(&mut connection).unwrap();
        run(&mut connection).unwrap();
        assert_eq!(user_version(&connection), 10);
        assert_legacy_data_preserved(&connection);
    }

    #[test]
    fn legacy_frontend_ddl_still_runs_after_migration() {
        // The legacy frontend keeps running `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE` (errors ignored) on
        // startup until it is removed, so the migrated schema must tolerate it.
        let mut connection = legacy_database(true);
        run(&mut connection).unwrap();
        connection
            .execute_batch(
                OLDEST_LEGACY_SCHEMA
                    .replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")
                    .as_str(),
            )
            .unwrap();
        assert!(
            connection
                .execute("ALTER TABLE videos ADD COLUMN is_watched BOOLEAN", params![])
                .is_err()
        );
        assert_legacy_data_preserved(&connection);
    }
}
