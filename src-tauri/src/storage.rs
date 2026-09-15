use std::fs;
use std::path::PathBuf;

use rusqlite::{Connection, OptionalExtension, params};
use tauri::Manager;
use thiserror::Error;

const MIGRATIONS: &[Migration] = &[Migration {
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
}];

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
    #[error("GameVault could not find the application data directory.")]
    MissingAppDataDir,
    #[error("GameVault could not prepare local storage: {0}")]
    Io(#[from] std::io::Error),
    #[error("GameVault could not prepare the local database: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

pub fn initialize(app: &tauri::AppHandle) -> Result<AppDataPaths, StorageError> {
    let paths = app_data_paths(app)?;

    fs::create_dir_all(&paths.app_data_dir)?;
    fs::create_dir_all(&paths.covers_dir)?;
    fs::create_dir_all(&paths.backups_dir)?;

    let connection = Connection::open(&paths.database_path)?;
    run_migrations(&connection)?;

    Ok(paths)
}

fn app_data_paths(app: &tauri::AppHandle) -> Result<AppDataPaths, StorageError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| StorageError::MissingAppDataDir)?;

    Ok(AppDataPaths {
        database_path: app_data_dir.join("gamevault.db"),
        covers_dir: app_data_dir.join("covers"),
        backups_dir: app_data_dir.join("backups"),
        app_data_dir,
    })
}

fn run_migrations(connection: &Connection) -> Result<(), StorageError> {
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

    for migration in MIGRATIONS {
        let applied = connection
            .query_row(
                "SELECT version FROM schema_migrations WHERE version = ?1",
                params![migration.version],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .is_some();

        if !applied {
            connection.execute_batch(migration.sql)?;
            connection.execute(
                "INSERT INTO schema_migrations (version, name) VALUES (?1, ?2)",
                params![migration.version, migration.name],
            )?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
