use super::*;
use crate::catalog::{self, GameInput};
use std::io::{Cursor, Write};

/// Named archive entries (name, bytes) for `craft`.
type Entries<'a> = Vec<(&'a str, &'a [u8])>;

fn png(shade: u8) -> Vec<u8> {
    let mut bytes = Vec::new();
    image::RgbaImage::from_pixel(2, 2, image::Rgba([shade, 0, 0, 255]))
        .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
        .unwrap();
    bytes
}
fn game(title: &str, cover: Option<String>) -> GameInput {
    GameInput {
        title: title.into(),
        platform_id: 1,
        media_type: "Physical".into(),
        play_status: "Not Started".into(),
        cover_path: cover,
        notes_html: "<p>Kept</p>".into(),
        tags: vec!["Retro".into()],
        ..Default::default()
    }
}
fn connect(root: &Path) -> Connection {
    let c = Connection::open(root.join(DB_NAME)).unwrap();
    c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    storage::run_migrations(&c).unwrap();
    c
}
/// A library with two games (one with a cover) and a custom platform with an icon.
fn library(cover_shade: u8) -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().unwrap();
    let c = connect(dir.path());
    let cover = assets::import_bytes(dir.path(), &png(cover_shade), "covers").unwrap();
    let icon = assets::import_bytes(dir.path(), &png(99), "platform-icons").unwrap();
    catalog::save_platform(&c, None, "Custom Box", "CB", Some(icon)).unwrap();
    catalog::save_game(&c, None, game("Alpha", Some(cover.clone()))).unwrap();
    catalog::save_game(&c, None, game("Beta", None)).unwrap();
    (dir, cover)
}
fn titles(root: &Path) -> Vec<String> {
    let mut titles: Vec<_> = catalog::list_games(&connect(root))
        .unwrap()
        .into_iter()
        .map(|g| g.data.title)
        .collect();
    titles.sort();
    titles
}
fn leftovers(root: &Path) -> Vec<String> {
    fs::read_dir(root)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .filter(|n| n.starts_with(".restore-") || n.starts_with(".backup-"))
        .collect()
}
/// Builds an arbitrary archive so hostile or damaged inputs can be tested.
fn craft(entries: &[(&str, &[u8])]) -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("crafted.zip");
    let mut zip = ZipWriter::new(File::create(&path).unwrap());
    for (name, data) in entries {
        zip.start_file(*name, SimpleFileOptions::default()).unwrap();
        zip.write_all(data).unwrap();
    }
    zip.finish().unwrap();
    (dir, path)
}
fn manifest(schema: i64, format: &str, version: u32) -> Vec<u8> {
    serde_json::to_vec(&Manifest {
        format: format.into(),
        format_version: version,
        app_version: "0.1.0".into(),
        schema_version: schema,
        created_at: "2026-01-01T00:00:00Z".into(),
        games: 0,
        images: 0,
        missing_images: 0,
    })
    .unwrap()
}
fn real_database() -> Vec<u8> {
    let (dir, _) = library(1);
    fs::read(dir.path().join(DB_NAME)).unwrap()
}

#[test]
fn round_trip_restores_records_tags_notes_and_images() {
    let (dir, cover) = library(10);
    let out = tempfile::tempdir().unwrap();
    let archive = out.path().join("backup.zip");
    let made = create(dir.path(), &archive).unwrap();
    assert_eq!((made.games, made.images, made.missing_images), (2, 2, 0));
    assert!(leftovers(dir.path()).is_empty());
    assert!(!out.path().join("backup.zip.part").exists());
    let manifest = inspect(&archive).unwrap();
    assert_eq!((manifest.games, manifest.images), (2, 2));
    assert_eq!(manifest.schema_version, storage::latest_version());

    // Change the live library after the backup, then restore.
    let c = connect(dir.path());
    let games = catalog::list_games(&c).unwrap();
    catalog::delete_game(
        &c,
        games.iter().find(|g| g.data.title == "Alpha").unwrap().id,
    )
    .unwrap();
    catalog::save_game(&c, None, game("Gamma", None)).unwrap();
    fs::remove_file(assets::resolve(dir.path(), &cover).unwrap()).unwrap();
    drop(c);
    assert_eq!(titles(dir.path()), ["Beta", "Gamma"]);

    let restored = restore(dir.path(), &archive).unwrap();
    assert_eq!(
        (restored.games, restored.images, restored.missing_images),
        (2, 2, 0)
    );
    assert_eq!(titles(dir.path()), ["Alpha", "Beta"]);
    let alpha = catalog::list_games(&connect(dir.path()))
        .unwrap()
        .into_iter()
        .find(|g| g.data.title == "Alpha")
        .unwrap();
    assert_eq!(alpha.data.notes_html, "<p>Kept</p>");
    assert_eq!(alpha.data.tags, ["Retro"]);
    assert_eq!(alpha.data.cover_path.as_deref(), Some(cover.as_str()));
    assert_eq!(
        fs::read(assets::resolve(dir.path(), &cover).unwrap()).unwrap(),
        png(10)
    );
    assert!(
        assets::data_url(dir.path(), &cover)
            .unwrap()
            .starts_with("data:image/png")
    );
    assert!(leftovers(dir.path()).is_empty());

    // The pre-restore safety backup holds the state that was replaced.
    let safety = restored.safety_backup.unwrap();
    assert!(safety.contains("pre-restore"));
    let previous = inspect(Path::new(&safety)).unwrap();
    assert_eq!(previous.games, 2);
    restore(dir.path(), Path::new(&safety)).unwrap();
    assert_eq!(titles(dir.path()), ["Beta", "Gamma"]);
}

#[test]
fn restore_into_a_fresh_installation() {
    let (dir, cover) = library(20);
    let out = tempfile::tempdir().unwrap();
    let archive = out.path().join("backup.zip");
    create(dir.path(), &archive).unwrap();
    let fresh = tempfile::tempdir().unwrap();
    let restored = restore(fresh.path(), &archive).unwrap();
    assert!(restored.safety_backup.is_none());
    assert_eq!(titles(fresh.path()), ["Alpha", "Beta"]);
    assert_eq!(
        fs::read(assets::resolve(fresh.path(), &cover).unwrap()).unwrap(),
        png(20)
    );
}

#[test]
fn backup_replaces_an_existing_file_and_needs_a_library() {
    let (dir, _) = library(1);
    let out = tempfile::tempdir().unwrap();
    let archive = out.path().join("backup.zip");
    fs::write(&archive, b"old").unwrap();
    create(dir.path(), &archive).unwrap();
    assert!(inspect(&archive).is_ok());
    let empty = tempfile::tempdir().unwrap();
    assert!(create(empty.path(), &out.path().join("none.zip")).is_err());
    assert!(!empty.path().join(DB_NAME).exists());
    assert!(leftovers(empty.path()).is_empty());
}

#[test]
fn missing_cover_files_are_reported_not_fatal() {
    let (dir, cover) = library(1);
    fs::remove_file(assets::resolve(dir.path(), &cover).unwrap()).unwrap();
    let out = tempfile::tempdir().unwrap();
    let archive = out.path().join("backup.zip");
    let made = create(dir.path(), &archive).unwrap();
    assert_eq!((made.images, made.missing_images), (1, 1));
    let restored = restore(dir.path(), &archive).unwrap();
    assert_eq!((restored.images, restored.missing_images), (1, 1));
    assert_eq!(titles(dir.path()), ["Alpha", "Beta"]);
}

#[test]
fn hostile_or_foreign_archives_are_rejected_before_extraction() {
    let ok = manifest(3, FORMAT, 1);
    let db = real_database();
    let uuid = uuid::Uuid::new_v4();
    let good_name = format!("covers/{uuid}.png");
    let cases: Vec<(&str, Entries)> = vec![
        ("no manifest", vec![(DB_NAME, &db)]),
        ("no database", vec![(MANIFEST_NAME, &ok)]),
        (
            "traversal",
            vec![(MANIFEST_NAME, &ok), (DB_NAME, &db), ("../evil.png", b"x")],
        ),
        (
            "nested traversal",
            vec![
                (MANIFEST_NAME, &ok),
                (DB_NAME, &db),
                ("covers/../../evil.png", b"x"),
            ],
        ),
        (
            "absolute path",
            vec![(MANIFEST_NAME, &ok), (DB_NAME, &db), ("/etc/passwd", b"x")],
        ),
        (
            "unmanaged name",
            vec![
                (MANIFEST_NAME, &ok),
                (DB_NAME, &db),
                ("covers/readme.txt", b"x"),
            ],
        ),
        (
            "non-uuid image",
            vec![(MANIFEST_NAME, &ok), (DB_NAME, &db), ("covers/a.png", b"x")],
        ),
        (
            "extra directory",
            vec![(MANIFEST_NAME, &ok), (DB_NAME, &db), ("covers/", b"")],
        ),
        (
            "other file",
            vec![(MANIFEST_NAME, &ok), (DB_NAME, &db), ("notes.txt", b"x")],
        ),
    ];
    let target = library(1).0;
    for (label, entries) in cases {
        let (_keep, path) = craft(&entries);
        assert!(inspect(&path).is_err(), "{label} should be rejected");
        assert!(
            restore(target.path(), &path).is_err(),
            "{label} should not restore"
        );
        assert_eq!(
            titles(target.path()),
            ["Alpha", "Beta"],
            "{label} touched the library"
        );
        assert!(
            leftovers(target.path()).is_empty(),
            "{label} left staging files"
        );
    }
    // Sanity: the same shape with a well-formed image name is accepted by inspection.
    let (_keep, path) = craft(&[(MANIFEST_NAME, &ok), (DB_NAME, &db), (&good_name, &png(1))]);
    assert!(inspect(&path).is_ok());
    let plain = tempfile::tempdir().unwrap();
    fs::write(plain.path().join("x.zip"), b"definitely not a zip").unwrap();
    assert!(inspect(&plain.path().join("x.zip")).is_err());
    assert!(inspect(&plain.path().join("missing.zip")).is_err());
}

#[test]
fn newer_or_foreign_manifests_are_refused() {
    let db = real_database();
    for (label, bytes) in [
        (
            "newer schema",
            manifest(storage::latest_version() + 1, FORMAT, 1),
        ),
        ("newer format", manifest(3, FORMAT, FORMAT_VERSION + 1)),
        ("other app", manifest(3, "something-else", 1)),
        ("garbage manifest", b"{not json".to_vec()),
    ] {
        let (_keep, path) = craft(&[(MANIFEST_NAME, &bytes), (DB_NAME, &db)]);
        assert!(inspect(&path).is_err(), "{label}");
    }
    let (_keep, path) = craft(&[
        (
            MANIFEST_NAME,
            &manifest(storage::latest_version() + 1, FORMAT, 1),
        ),
        (DB_NAME, &db),
    ]);
    assert!(inspect(&path).unwrap_err().contains("newer version"));
}

#[test]
fn damaged_content_never_replaces_the_live_library() {
    let ok = manifest(3, FORMAT, 1);
    let real = real_database();
    let mut truncated = real.clone();
    truncated.truncate(real.len() / 2);
    let mut flipped = real.clone();
    for byte in flipped.iter_mut().skip(4096).take(8192) {
        *byte = 0xFF;
    }
    let empty_db = {
        let dir = tempfile::tempdir().unwrap();
        Connection::open(dir.path().join("e.db"))
            .unwrap()
            .execute_batch("CREATE TABLE t(x);")
            .unwrap();
        fs::read(dir.path().join("e.db")).unwrap()
    };
    let escaping = {
        let (dir, _) = library(1);
        let c = connect(dir.path());
        c.execute(
            "UPDATE games SET cover_path='../../secret.png' WHERE title='Beta'",
            [],
        )
        .unwrap();
        drop(c);
        let snapshot = dir.path().join("copy.db");
        connect(dir.path())
            .execute("VACUUM INTO ?1", [snapshot.to_str().unwrap()])
            .unwrap();
        fs::read(snapshot).unwrap()
    };
    let uuid = uuid::Uuid::new_v4();
    let fake_image = format!("covers/{uuid}.png");
    let target = library(1).0;
    let cases: Vec<(&str, Entries)> = vec![
        (
            "not a database",
            vec![(MANIFEST_NAME, &ok), (DB_NAME, b"plain text, not sqlite")],
        ),
        (
            "truncated database",
            vec![(MANIFEST_NAME, &ok), (DB_NAME, &truncated)],
        ),
        (
            "corrupted pages",
            vec![(MANIFEST_NAME, &ok), (DB_NAME, &flipped)],
        ),
        (
            "wrong tables",
            vec![(MANIFEST_NAME, &ok), (DB_NAME, &empty_db)],
        ),
        (
            "image path escapes",
            vec![(MANIFEST_NAME, &ok), (DB_NAME, &escaping)],
        ),
        (
            "fake image",
            vec![
                (MANIFEST_NAME, &ok),
                (DB_NAME, &real),
                (&fake_image, b"not a png"),
            ],
        ),
    ];
    for (label, entries) in cases {
        let (_keep, path) = craft(&entries);
        assert!(
            restore(target.path(), &path).is_err(),
            "{label} should fail"
        );
        assert_eq!(
            titles(target.path()),
            ["Alpha", "Beta"],
            "{label} changed the library"
        );
        assert!(target.path().join("covers").is_dir(), "{label}");
        assert!(
            leftovers(target.path()).is_empty(),
            "{label} left staging files"
        );
    }
    // No safety backup is written when validation fails, so nothing accumulated.
    assert!(!target.path().join("backups").exists());
}

#[test]
fn image_extension_must_match_content() {
    let ok = manifest(3, FORMAT, 1);
    let db = real_database();
    let uuid = uuid::Uuid::new_v4();
    let name = format!("covers/{uuid}.jpg");
    let (_keep, path) = craft(&[(MANIFEST_NAME, &ok), (DB_NAME, &db), (&name, &png(3))]);
    let target = library(1).0;
    assert!(
        restore(target.path(), &path)
            .unwrap_err()
            .contains("wrong type")
    );
    assert_eq!(titles(target.path()), ["Alpha", "Beta"]);
}

#[test]
fn a_failed_swap_is_rolled_back() {
    let dir = tempfile::tempdir().unwrap();
    let (a, b, c) = (
        dir.path().join("a"),
        dir.path().join("b"),
        dir.path().join("c"),
    );
    fs::write(&a, b"one").unwrap();
    let mut journal = Journal::default();
    journal.rename(&a, &b).unwrap();
    assert!(journal.rename(&dir.path().join("missing"), &c).is_err());
    journal.rollback();
    assert_eq!(fs::read(&a).unwrap(), b"one");
    assert!(!b.exists() && !c.exists());
}

#[test]
fn swap_failure_keeps_the_previous_library() {
    let (dir, cover) = library(5);
    let stage = dir.path().join(".restore-test");
    let (old, staged) = (stage.join("old"), stage.join("new"));
    fs::create_dir_all(&old).unwrap();
    fs::create_dir_all(&staged).unwrap();
    // Only the database is staged: moving `covers` in must fail after the live
    // library has already been moved aside.
    fs::write(staged.join(DB_NAME), b"replacement").unwrap();
    let mut journal = Journal::default();
    assert!(swap(dir.path(), &old, &staged, &mut journal).is_err());
    journal.rollback();
    assert_eq!(titles(dir.path()), ["Alpha", "Beta"]);
    assert_eq!(
        fs::read(assets::resolve(dir.path(), &cover).unwrap()).unwrap(),
        png(5)
    );
}

#[test]
fn older_schema_backups_are_migrated_forward() {
    // A version-2 database, as an earlier XpieDB would have written it.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("old.db");
    let c = Connection::open(&path).unwrap();
    c.execute_batch(
        "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, \
         applied_at TEXT NOT NULL DEFAULT (datetime('now'))); \
         CREATE TABLE app_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);",
    )
    .unwrap();
    c.execute_batch(include_str!("../../migrations/002_library.sql"))
        .unwrap();
    c.execute_batch(
        "INSERT INTO schema_migrations (version, name) VALUES (1,'foundation'),(2,'local_library'); \
         INSERT INTO games (title, platform_id) VALUES ('Old Game', 1);",
    )
    .unwrap();
    assert!(c.prepare("SELECT account FROM games").is_err());
    drop(c);
    let db = fs::read(&path).unwrap();
    let (_keep, archive) = craft(&[(MANIFEST_NAME, &manifest(2, FORMAT, 1)), (DB_NAME, &db)]);
    let target = tempfile::tempdir().unwrap();
    let restored = restore(target.path(), &archive).unwrap();
    assert_eq!(restored.games, 1);
    let c = connect(target.path());
    let account: Option<String> = c
        .query_row("SELECT account FROM games", [], |r| r.get(0))
        .unwrap();
    assert!(account.is_none());
    assert_eq!(titles(target.path()), ["Old Game"]);
    assert_eq!(
        count(&c, "SELECT MAX(version) FROM schema_migrations").unwrap(),
        storage::latest_version()
    );
}
