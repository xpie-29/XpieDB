use std::fs;
use std::path::PathBuf;

use rusqlite::{Connection, OptionalExtension, params};
use tauri::Manager;
use thiserror::Error;

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "foundation",
        sql: r#"
        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        );

        INSERT OR IGNORE INTO app_meta (key, value)
        VALUES ('schema', 'foundation');
    "#,
    },
    Migration {
        version: 2,
        name: "local_library",
        sql: include_str!("../migrations/002_library.sql"),
    },
    Migration {
        version: 3,
        name: "game_account",
        sql: include_str!("../migrations/003_account.sql"),
    },
    Migration {
        version: 4,
        name: "backlog_order",
        sql: include_str!("../migrations/004_backlog.sql"),
    },
    Migration {
        version: 5,
        name: "more_platforms",
        sql: include_str!("../migrations/005_more_platforms.sql"),
    },
    Migration {
        version: 6,
        name: "hardware",
        sql: include_str!("../migrations/006_hardware.sql"),
    },
    Migration {
        version: 7,
        name: "guides",
        sql: include_str!("../migrations/007_guides.sql"),
    },
    Migration {
        version: 8,
        name: "guide_files",
        sql: include_str!("../migrations/008_guide_files.sql"),
    },
];

/// Highest schema version this build understands.
pub(crate) fn latest_version() -> i64 {
    MIGRATIONS.last().map_or(0, |m| m.version)
}

#[derive(Debug)]
pub struct AppDataPaths {
    pub app_data_dir: PathBuf,
    pub database_path: PathBuf,
    pub covers_dir: PathBuf,
    pub backups_dir: PathBuf,
}

#[derive(Debug)]
struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
}

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("XpieDB could not find the application data directory.")]
    MissingAppDataDir,
    #[error("XpieDB could not prepare local storage: {0}")]
    Io(#[from] std::io::Error),
    #[error("XpieDB could not prepare the local database: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

pub fn initialize(app: &tauri::AppHandle) -> Result<AppDataPaths, StorageError> {
    let paths = app_data_paths(app)?;

    fs::create_dir_all(&paths.app_data_dir)?;
    fs::create_dir_all(&paths.covers_dir)?;
    fs::create_dir_all(&paths.backups_dir)?;

    let connection = Connection::open(&paths.database_path)?;
    run_migrations(&connection)?;
    crate::catalog::normalize_backlog(&connection)?;

    Ok(paths)
}

fn app_data_paths(app: &tauri::AppHandle) -> Result<AppDataPaths, StorageError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| StorageError::MissingAppDataDir)?;

    Ok(AppDataPaths {
        database_path: app_data_dir.join("xpiedb.db"),
        covers_dir: app_data_dir.join("covers"),
        backups_dir: app_data_dir.join("backups"),
        app_data_dir,
    })
}

pub(crate) fn run_migrations(connection: &Connection) -> Result<(), StorageError> {
    apply_migrations(connection, MIGRATIONS)
}

fn apply_migrations(connection: &Connection, migrations: &[Migration]) -> Result<(), StorageError> {
    connection.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        "#,
    )?;

    for migration in migrations {
        let transaction = connection.unchecked_transaction()?;
        let applied = transaction
            .query_row(
                "SELECT version FROM schema_migrations WHERE version = ?1",
                params![migration.version],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .is_some();

        if !applied {
            transaction.execute_batch(migration.sql)?;
            transaction.execute(
                "INSERT INTO schema_migrations (version, name) VALUES (?1, ?2)",
                params![migration.version, migration.name],
            )?;
        }
        transaction.commit()?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn account_migration_preserves_milestone_two_records() {
        let connection = Connection::open_in_memory().unwrap();
        apply_migrations(&connection, &MIGRATIONS[..2]).unwrap();
        connection.execute("INSERT INTO games(title,platform_id,notes_html,rating) VALUES ('Existing game',1,'<p>Preserved notes</p>',4)", []).unwrap();
        connection
            .execute("INSERT INTO tags(name) VALUES ('Existing tag')", [])
            .unwrap();
        connection
            .execute("INSERT INTO game_tags(game_id,tag_id) VALUES (1,1)", [])
            .unwrap();
        run_migrations(&connection).unwrap();
        run_migrations(&connection).unwrap();
        let game = crate::catalog::get_game(&connection, 1).unwrap();
        assert_eq!(game.data.account, None);
        assert_eq!(game.data.title, "Existing game");
        assert_eq!(game.data.notes_html, "<p>Preserved notes</p>");
        assert_eq!(game.data.rating, Some(4));
        assert_eq!(game.data.tags, vec!["Existing tag"]);
    }

    #[test]
    fn account_column_rolls_back_when_bookkeeping_fails() {
        let connection = Connection::open_in_memory().unwrap();
        apply_migrations(&connection, &MIGRATIONS[..2]).unwrap();
        connection.execute_batch("CREATE TRIGGER reject_account BEFORE INSERT ON schema_migrations WHEN NEW.version=3 BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
        assert!(run_migrations(&connection).is_err());
        let count: i64 = connection
            .query_row(
                "SELECT count(*) FROM pragma_table_info('games') WHERE name='account'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
        connection
            .execute_batch("DROP TRIGGER reject_account;")
            .unwrap();
        run_migrations(&connection).unwrap();
        let count: i64 = connection
            .query_row(
                "SELECT count(*) FROM schema_migrations WHERE version=3",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn failed_migration_rolls_back_schema_and_bookkeeping() {
        let connection = Connection::open_in_memory().unwrap();
        run_migrations(&connection).unwrap();
        let next = latest_version() + 1;
        let bad = [Migration {
            version: next,
            name: "broken",
            sql: "CREATE TABLE should_rollback (id INTEGER); INSERT INTO missing_table VALUES (1);",
        }];
        assert!(apply_migrations(&connection, &bad).is_err());
        let count: i64 = connection
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE name='should_rollback'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
        let count: i64 = connection
            .query_row(
                "SELECT count(*) FROM schema_migrations WHERE version=?1",
                [next],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn backlog_column_rolls_back_when_bookkeeping_fails() {
        let connection = Connection::open_in_memory().unwrap();
        apply_migrations(&connection, &MIGRATIONS[..3]).unwrap();
        connection.execute_batch("CREATE TRIGGER reject_backlog BEFORE INSERT ON schema_migrations WHEN NEW.version=4 BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
        assert!(run_migrations(&connection).is_err());
        let has_column = |connection: &Connection| -> i64 {
            connection
                .query_row(
                    "SELECT count(*) FROM pragma_table_info('games') WHERE name='backlog_position'",
                    [],
                    |r| r.get(0),
                )
                .unwrap()
        };
        assert_eq!(has_column(&connection), 0);
        connection
            .execute_batch("DROP TRIGGER reject_backlog;")
            .unwrap();
        run_migrations(&connection).unwrap();
        assert_eq!(has_column(&connection), 1);
    }

    fn platform_rows(connection: &Connection) -> Vec<(i64, String, i64, bool)> {
        connection
            .prepare("SELECT id, name, sort_order, is_builtin FROM platforms ORDER BY id")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    #[test]
    fn more_platforms_keep_old_ids_and_group_the_sort_order() {
        let connection = Connection::open_in_memory().unwrap();
        apply_migrations(&connection, &MIGRATIONS[..4]).unwrap();
        let before = platform_rows(&connection);
        assert_eq!(before.len(), 20);
        run_migrations(&connection).unwrap();
        let after = platform_rows(&connection);
        assert_eq!(after.len(), 35);
        // The 20 original rows keep their ids and names (games and Steam import point at them).
        for (old, new) in before.iter().zip(&after) {
            assert_eq!((old.0, &old.1), (new.0, &new.1));
        }
        assert_eq!(after[17].1, "Steam");
        assert_eq!(after[20].1, "PlayStation Portable");
        assert_eq!(after[34].1, "Game Gear");
        assert!(after.iter().all(|p| p.3));
        // Positions are exactly 1..=35, so the list order is fully defined.
        let mut positions: Vec<i64> = after.iter().map(|p| p.2).collect();
        positions.sort_unstable();
        assert_eq!(positions, (1..=35).collect::<Vec<i64>>());
        let by_position = |connection: &Connection| -> Vec<String> {
            connection
                .prepare("SELECT name FROM platforms ORDER BY sort_order")
                .unwrap()
                .query_map([], |r| r.get(0))
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap()
        };
        let names = by_position(&connection);
        assert_eq!(names[0], "Nintendo Entertainment System");
        assert_eq!(names[13], "Nintendo 3DS");
        assert_eq!(names[14], "PlayStation");
        assert_eq!(names[34], "PC");
    }

    #[test]
    fn a_custom_platform_with_a_new_built_in_name_is_adopted_not_duplicated() {
        let connection = Connection::open_in_memory().unwrap();
        apply_migrations(&connection, &MIGRATIONS[..4]).unwrap();
        connection
            .execute(
                "INSERT INTO platforms (name, short_name, icon_path, is_builtin) VALUES ('game boy advance', 'MyGBA', 'platform-icons/mine.png', 0)",
                [],
            )
            .unwrap();
        let custom_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO games (title, platform_id) VALUES ('Metroid Fusion', ?1)",
                [custom_id],
            )
            .unwrap();
        run_migrations(&connection).unwrap();
        let (name, short, icon, builtin): (String, String, Option<String>, bool) = connection
            .query_row(
                "SELECT name, short_name, icon_path, is_builtin FROM platforms WHERE id=?1",
                [custom_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        // Same row: the owner's spelling, short name and icon survive; it is now built-in.
        assert_eq!(name, "game boy advance");
        assert_eq!(short, "MyGBA");
        assert_eq!(icon.as_deref(), Some("platform-icons/mine.png"));
        assert!(builtin);
        let games: i64 = connection
            .query_row(
                "SELECT count(*) FROM games WHERE platform_id=?1",
                [custom_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(games, 1);
        assert_eq!(platform_rows(&connection).len(), 35);
    }

    #[test]
    fn more_platforms_roll_back_when_bookkeeping_fails() {
        let connection = Connection::open_in_memory().unwrap();
        apply_migrations(&connection, &MIGRATIONS[..4]).unwrap();
        let before = platform_rows(&connection);
        connection.execute_batch("CREATE TRIGGER reject_platforms BEFORE INSERT ON schema_migrations WHEN NEW.version=5 BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
        assert!(run_migrations(&connection).is_err());
        assert_eq!(platform_rows(&connection), before);
        connection
            .execute_batch("DROP TRIGGER reject_platforms;")
            .unwrap();
        run_migrations(&connection).unwrap();
        assert_eq!(platform_rows(&connection).len(), 35);
    }

    #[test]
    fn hardware_tables_roll_back_when_bookkeeping_fails() {
        let connection = Connection::open_in_memory().unwrap();
        apply_migrations(&connection, &MIGRATIONS[..5]).unwrap();
        connection.execute_batch("CREATE TRIGGER reject_hardware BEFORE INSERT ON schema_migrations WHEN NEW.version=6 BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
        assert!(run_migrations(&connection).is_err());
        let tables = |connection: &Connection| -> i64 {
            connection
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE name IN ('hardware','hardware_compat')",
                    [],
                    |r| r.get(0),
                )
                .unwrap()
        };
        assert_eq!(tables(&connection), 0);
        connection
            .execute_batch("DROP TRIGGER reject_hardware;")
            .unwrap();
        run_migrations(&connection).unwrap();
        assert_eq!(tables(&connection), 2);
    }

    #[test]
    fn guides_table_rolls_back_when_bookkeeping_fails() {
        let connection = Connection::open_in_memory().unwrap();
        apply_migrations(&connection, &MIGRATIONS[..6]).unwrap();
        connection.execute_batch("CREATE TRIGGER reject_guides BEFORE INSERT ON schema_migrations WHEN NEW.version=7 BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
        assert!(run_migrations(&connection).is_err());
        let tables = |connection: &Connection| -> i64 {
            connection
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE name='guides'",
                    [],
                    |r| r.get(0),
                )
                .unwrap()
        };
        assert_eq!(tables(&connection), 0);
        connection
            .execute_batch("DROP TRIGGER reject_guides;")
            .unwrap();
        run_migrations(&connection).unwrap();
        assert_eq!(tables(&connection), 1);
    }

    #[test]
    fn guide_files_table_rolls_back_when_bookkeeping_fails() {
        let connection = Connection::open_in_memory().unwrap();
        apply_migrations(&connection, &MIGRATIONS[..7]).unwrap();
        connection.execute_batch("CREATE TRIGGER reject_files BEFORE INSERT ON schema_migrations WHEN NEW.version=8 BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
        assert!(run_migrations(&connection).is_err());
        let tables = |connection: &Connection| -> i64 {
            connection
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE name='guide_files'",
                    [],
                    |r| r.get(0),
                )
                .unwrap()
        };
        assert_eq!(tables(&connection), 0);
        connection
            .execute_batch("DROP TRIGGER reject_files;")
            .unwrap();
        run_migrations(&connection).unwrap();
        assert_eq!(tables(&connection), 1);
    }

    #[test]
    fn foundation_migration_is_repeatable_and_preserves_data() {
        let connection = Connection::open_in_memory().unwrap();
        run_migrations(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO app_meta (key, value) VALUES ('test', 'preserved')",
                [],
            )
            .unwrap();
        run_migrations(&connection).unwrap();
        let count: i64 = connection
            .query_row("SELECT count(*) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, MIGRATIONS.len() as i64);
        let value: String = connection
            .query_row("SELECT value FROM app_meta WHERE key = 'test'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(value, "preserved");
        let enabled: i64 = connection
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        assert_eq!(enabled, 1);
    }
}
