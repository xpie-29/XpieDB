//! Backup and restore of the whole local collection.
//!
//! A backup is a plain ZIP holding `manifest.json`, a consistent snapshot of the
//! SQLite database, and every managed image the catalog references. Rust owns all
//! paths: the frontend never sees or supplies a filesystem location. Secrets such
//! as IGDB credentials live in the OS credential store and are never archived.
#[cfg(test)]
mod tests;

use crate::{assets, catalog::Result, storage};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{self, Read},
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};

const FORMAT: &str = "xpiedb-backup";
const FORMAT_VERSION: u32 = 1;
const DB_NAME: &str = "xpiedb.db";
const MANIFEST_NAME: &str = "manifest.json";
const MAX_MANIFEST_BYTES: u64 = 64 * 1024;
const MAX_DB_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_ENTRIES: usize = 200_000;
const IMAGE_DIRS: [&str; 2] = ["covers", "platform-icons"];
/// Live files and directories replaced by a restore, in swap order.
const LIVE_ITEMS: [&str; 6] = [
    DB_NAME,
    "xpiedb.db-wal",
    "xpiedb.db-shm",
    "xpiedb.db-journal",
    "covers",
    "platform-icons",
];

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Manifest {
    pub format: String,
    pub format_version: u32,
    pub app_version: String,
    pub schema_version: i64,
    pub created_at: String,
    pub games: i64,
    pub images: i64,
    #[serde(default)]
    pub missing_images: i64,
}

#[derive(Debug, Serialize)]
pub struct CreateResult {
    pub path: String,
    pub games: i64,
    pub images: i64,
    pub missing_images: i64,
}

#[derive(Debug, Serialize)]
pub struct RestoreResult {
    pub games: i64,
    pub images: i64,
    pub missing_images: i64,
    pub safety_backup: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RestorePreview {
    pub file_name: String,
    pub created_at: String,
    pub app_version: String,
    pub games: i64,
    pub images: i64,
    pub missing_images: i64,
}

fn err(error: impl std::fmt::Display) -> String {
    error.to_string()
}
fn timestamp(format: &str) -> Result<String> {
    Connection::open_in_memory()
        .and_then(|c| c.query_row("SELECT strftime(?1,'now')", [format], |r| r.get(0)))
        .map_err(err)
}
fn count(c: &Connection, sql: &str) -> Result<i64> {
    c.query_row(sql, [], |r| r.get(0)).map_err(err)
}
fn referenced_images(c: &Connection) -> Result<Vec<String>> {
    let mut statement = c
        .prepare(
            "SELECT cover_path FROM games WHERE cover_path IS NOT NULL \
             UNION SELECT icon_path FROM platforms WHERE icon_path IS NOT NULL ORDER BY 1",
        )
        .map_err(err)?;
    statement
        .query_map([], |r| r.get(0))
        .map_err(err)?
        .collect::<std::result::Result<_, _>>()
        .map_err(err)
}

/// Writes a backup of the library under `root` to `dest`. The archive is built
/// beside `dest` and renamed into place, so a failure never leaves a partial file.
pub fn create(root: &Path, dest: &Path) -> Result<CreateResult> {
    let work = root.join(format!(".backup-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&work).map_err(err)?;
    let mut part = dest.as_os_str().to_owned();
    part.push(".part");
    let part = PathBuf::from(part);
    let result = write_archive(root, dest, &work, &part);
    let _ = fs::remove_dir_all(&work);
    if result.is_err() {
        let _ = fs::remove_file(&part);
    }
    result
}

fn write_archive(root: &Path, dest: &Path, work: &Path, part: &Path) -> Result<CreateResult> {
    if !root.join(DB_NAME).is_file() {
        return Err("There is no library to back up.".into());
    }
    let snapshot = work.join(DB_NAME);
    {
        let live = Connection::open(root.join(DB_NAME)).map_err(err)?;
        live.busy_timeout(Duration::from_secs(5)).map_err(err)?;
        let target = snapshot
            .to_str()
            .ok_or("The backup path is not valid text.")?;
        live.execute("VACUUM INTO ?1", [target]).map_err(err)?;
    }
    let (games, references, schema_version, created_at) = {
        let c = Connection::open(&snapshot).map_err(err)?;
        (
            count(&c, "SELECT COUNT(*) FROM games")?,
            referenced_images(&c)?,
            count(&c, "SELECT COALESCE(MAX(version),0) FROM schema_migrations")?,
            timestamp("%Y-%m-%dT%H:%M:%SZ")?,
        )
    };
    let mut files = Vec::new();
    let mut missing = 0;
    for relative in references {
        match assets::resolve(root, &relative) {
            Ok(path) if path.is_file() => files.push((relative, path)),
            _ => missing += 1,
        }
    }
    let manifest = Manifest {
        format: FORMAT.into(),
        format_version: FORMAT_VERSION,
        app_version: env!("CARGO_PKG_VERSION").into(),
        schema_version,
        created_at,
        games,
        images: files.len() as i64,
        missing_images: missing,
    };
    let mut zip = ZipWriter::new(File::create(part).map_err(err)?);
    let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    // Cover formats are already compressed.
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    zip.start_file(MANIFEST_NAME, deflated).map_err(err)?;
    serde_json::to_writer_pretty(&mut zip, &manifest).map_err(err)?;
    zip.start_file(DB_NAME, deflated).map_err(err)?;
    io::copy(&mut File::open(&snapshot).map_err(err)?, &mut zip).map_err(err)?;
    for (relative, path) in &files {
        zip.start_file(relative, stored).map_err(err)?;
        io::copy(&mut File::open(path).map_err(err)?, &mut zip).map_err(err)?;
    }
    zip.finish().map_err(err)?.sync_all().map_err(err)?;
    fs::rename(part, dest).map_err(err)?;
    Ok(CreateResult {
        path: dest.display().to_string(),
        games,
        images: manifest.images,
        missing_images: missing,
    })
}

fn open_archive(archive: &Path) -> Result<ZipArchive<File>> {
    const INVALID: &str = "This file is not a valid XpieDB backup.";
    ZipArchive::new(File::open(archive).map_err(|_| "The backup file could not be opened.")?)
        .map_err(|_| INVALID.to_string())
}

/// Checks the archive structure and manifest without extracting anything. Every
/// entry name must be the manifest, the database, or a managed image path, which
/// rules out traversal and unexpected content by construction.
pub fn inspect(archive: &Path) -> Result<Manifest> {
    const INVALID: &str = "This file is not a valid XpieDB backup.";
    let mut zip = open_archive(archive)?;
    if zip.len() > MAX_ENTRIES {
        return Err("This backup contains too many files.".into());
    }
    let mut seen = HashSet::new();
    for i in 0..zip.len() {
        let entry = zip.by_index_raw(i).map_err(|_| INVALID.to_string())?;
        let name = entry.name().to_string();
        let limit = match name.as_str() {
            MANIFEST_NAME => MAX_MANIFEST_BYTES,
            DB_NAME => MAX_DB_BYTES,
            other => {
                assets::parse_relative(other).map_err(|_| INVALID.to_string())?;
                assets::MAX_BYTES
            }
        };
        if !seen.insert(name) || entry.is_dir() || entry.encrypted() || entry.size() > limit {
            return Err(INVALID.into());
        }
    }
    if !seen.contains(MANIFEST_NAME) || !seen.contains(DB_NAME) {
        return Err(INVALID.into());
    }
    let mut bytes = Vec::new();
    zip.by_name(MANIFEST_NAME)
        .map_err(|_| INVALID.to_string())?
        .take(MAX_MANIFEST_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| INVALID.to_string())?;
    let manifest: Manifest = serde_json::from_slice(&bytes).map_err(|_| INVALID.to_string())?;
    if manifest.format != FORMAT {
        return Err(INVALID.into());
    }
    if manifest.format_version > FORMAT_VERSION
        || manifest.schema_version > storage::latest_version()
    {
        return Err(
            "This backup was made by a newer version of XpieDB. Update XpieDB to restore it."
                .into(),
        );
    }
    Ok(manifest)
}

/// Extracts a validated archive into `dest` by building each path from the
/// already-validated entry name. Sizes are enforced while copying because the
/// sizes declared in an archive can be false.
fn extract(archive: &Path, dest: &Path) -> Result<()> {
    let mut zip = open_archive(archive)?;
    for dir in IMAGE_DIRS {
        fs::create_dir_all(dest.join(dir)).map_err(err)?;
    }
    for i in 0..zip.len() {
        let entry = zip.by_index(i).map_err(err)?;
        let name = entry.name().to_string();
        if name == MANIFEST_NAME {
            continue;
        }
        let limit = if name == DB_NAME {
            MAX_DB_BYTES
        } else {
            assets::MAX_BYTES
        };
        let target = dest.join(&name);
        if name == DB_NAME {
            let mut out = File::create(&target).map_err(err)?;
            let written = io::copy(&mut entry.take(limit + 1), &mut out).map_err(err)?;
            if written > limit {
                return Err("The backup database is larger than allowed.".into());
            }
            out.sync_all().map_err(err)?;
        } else {
            let mut bytes = Vec::new();
            entry.take(limit + 1).read_to_end(&mut bytes).map_err(err)?;
            let ext = name.rsplit('.').next().unwrap_or_default();
            if bytes.len() as u64 > limit || assets::detect_extension(&bytes) != Some(ext) {
                return Err(format!(
                    "The backup image {name} is damaged or the wrong type."
                ));
            }
            fs::write(&target, bytes).map_err(err)?;
        }
    }
    Ok(())
}

/// Verifies the extracted database and brings it to the current schema. Returns
/// the number of referenced images that are absent from the backup.
fn verify_database(dir: &Path) -> Result<(i64, i64, i64)> {
    const BAD: &str = "The backup database is damaged or incomplete.";
    let c = Connection::open(dir.join(DB_NAME)).map_err(|_| BAD.to_string())?;
    // Untrusted file: do not let schema-defined views or triggers call unsafe functions.
    c.execute_batch("PRAGMA trusted_schema=OFF;").map_err(err)?;
    let integrity: String = c
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|_| BAD.to_string())?;
    let has_tables = count(
        &c,
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN \
         ('games','platforms','tags','game_tags','preferences','schema_migrations')",
    )
    .map_err(|_| BAD.to_string())?;
    if integrity != "ok" || has_tables != 6 {
        return Err(BAD.into());
    }
    let violations = c
        .prepare("PRAGMA foreign_key_check")
        .and_then(|mut s| s.exists([]))
        .map_err(|_| BAD.to_string())?;
    if violations {
        return Err(BAD.into());
    }
    storage::run_migrations(&c).map_err(err)?;
    let mut present = 0;
    let mut missing = 0;
    for relative in referenced_images(&c)? {
        // Also rejects a database that points outside the managed image folders.
        assets::parse_relative(&relative).map_err(|_| BAD.to_string())?;
        if dir.join(&relative).is_file() {
            present += 1;
        } else {
            missing += 1;
        }
    }
    Ok((count(&c, "SELECT COUNT(*) FROM games")?, present, missing))
}

/// Renames that can be undone in reverse order if a later step fails.
#[derive(Default)]
struct Journal(Vec<(PathBuf, PathBuf)>);
impl Journal {
    fn rename(&mut self, from: &Path, to: &Path) -> Result<()> {
        fs::rename(from, to).map_err(err)?;
        self.0.push((from.into(), to.into()));
        Ok(())
    }
    fn rollback(self) {
        for (from, to) in self.0.into_iter().rev() {
            let _ = fs::rename(to, from);
        }
    }
}

/// Moves the live library aside into `old`, then moves the staged one into place.
fn swap(root: &Path, old: &Path, staged: &Path, journal: &mut Journal) -> Result<()> {
    for name in LIVE_ITEMS {
        let live = root.join(name);
        if live.symlink_metadata().is_ok() {
            journal.rename(&live, &old.join(name))?;
        }
    }
    for name in [DB_NAME, "covers", "platform-icons"] {
        journal.rename(&staged.join(name), &root.join(name))?;
    }
    Ok(())
}

/// Replaces the live library with the contents of `archive`.
///
/// Order matters: validate everything in a staging area, take a safety backup of
/// the current library, and only then swap. The swap is a short series of renames
/// on one filesystem that is rolled back if any of them fails.
pub fn restore(root: &Path, archive: &Path) -> Result<RestoreResult> {
    inspect(archive)?;
    let stage = root.join(format!(".restore-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&stage).map_err(err)?;
    let outcome = restore_from_stage(root, archive, &stage);
    let _ = fs::remove_dir_all(&stage);
    outcome
}

fn restore_from_stage(root: &Path, archive: &Path, stage: &Path) -> Result<RestoreResult> {
    let staged = stage.join("new");
    fs::create_dir_all(&staged).map_err(err)?;
    extract(archive, &staged)?;
    let (games, images, missing_images) = verify_database(&staged)?;

    let mut safety_backup = None;
    if root.join(DB_NAME).is_file() {
        let backups = root.join("backups");
        fs::create_dir_all(&backups).map_err(err)?;
        let name = format!("xpiedb-pre-restore-{}.zip", timestamp("%Y%m%d-%H%M%S")?);
        safety_backup = Some(
            create(root, &backups.join(name))
                .map_err(|e| {
                    format!(
                        "Restore cancelled: the current library could not be backed up first. {e}"
                    )
                })?
                .path,
        );
    }

    let old = stage.join("old");
    fs::create_dir_all(&old).map_err(err)?;
    let mut journal = Journal::default();
    if let Err(error) = swap(root, &old, &staged, &mut journal) {
        journal.rollback();
        return Err(format!(
            "Restore failed and your previous library was kept. {error}"
        ));
    }
    Ok(RestoreResult {
        games,
        images,
        missing_images,
        safety_backup,
    })
}

#[derive(Default)]
pub struct Backups {
    pending: Mutex<Option<PathBuf>>,
    running: Mutex<()>,
}

async fn run_blocking<T: Send + 'static>(
    app: &AppHandle,
    work: impl FnOnce(PathBuf) -> Result<T> + Send + 'static,
) -> Result<T> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Backups>();
        let _running = state
            .running
            .try_lock()
            .map_err(|_| "Another backup or restore is already running.".to_string())?;
        work(app.path().app_data_dir().map_err(err)?)
    })
    .await
    .map_err(err)?
}

#[tauri::command]
pub async fn backup_create(app: AppHandle) -> Result<Option<CreateResult>> {
    let suggested = format!("XpieDB-backup-{}.zip", timestamp("%Y%m%d-%H%M%S")?);
    let Some(chosen) = app
        .dialog()
        .file()
        .add_filter("XpieDB backup", &["zip"])
        .set_file_name(suggested)
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let mut dest = chosen.into_path().map_err(err)?;
    if dest.extension().is_none() {
        dest.set_extension("zip");
    }
    run_blocking(&app, move |root| create(&root, &dest))
        .await
        .map(Some)
}

/// Lets the user pick a backup and validates it. The chosen path stays in Rust
/// until the user confirms, so the frontend cannot substitute another file.
#[tauri::command]
pub async fn backup_choose_restore(
    app: AppHandle,
    state: tauri::State<'_, Backups>,
) -> Result<Option<RestorePreview>> {
    *state.pending.lock().map_err(err)? = None;
    let Some(chosen) = app
        .dialog()
        .file()
        .add_filter("XpieDB backup", &["zip"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = chosen.into_path().map_err(err)?;
    let (checked, manifest) = {
        let path = path.clone();
        run_blocking(&app, move |_| inspect(&path).map(|m| (path, m))).await?
    };
    *state.pending.lock().map_err(err)? = Some(checked.clone());
    Ok(Some(RestorePreview {
        file_name: checked
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        created_at: manifest.created_at,
        app_version: manifest.app_version,
        games: manifest.games,
        images: manifest.images,
        missing_images: manifest.missing_images,
    }))
}

#[tauri::command]
pub fn backup_cancel_restore(state: tauri::State<'_, Backups>) -> Result<()> {
    *state.pending.lock().map_err(err)? = None;
    Ok(())
}

#[tauri::command]
pub async fn backup_restore(
    app: AppHandle,
    state: tauri::State<'_, Backups>,
) -> Result<RestoreResult> {
    let path = state
        .pending
        .lock()
        .map_err(err)?
        .take()
        .ok_or("Choose a backup to restore first.")?;
    run_blocking(&app, move |root| restore(&root, &path)).await
}
