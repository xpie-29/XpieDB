use crate::{assets, catalog::*, commands::validate_url, storage};
use rusqlite::Connection;

fn database() -> (tempfile::TempDir, Connection) {
    let dir = tempfile::tempdir().unwrap();
    let c = Connection::open(dir.path().join("test.db")).unwrap();
    storage::run_migrations(&c).unwrap();
    (dir, c)
}
fn input() -> GameInput {
    GameInput {
        title: "Test Game".into(),
        platform_id: 1,
        media_type: "Physical".into(),
        play_status: "Not Started".into(),
        ..Default::default()
    }
}

#[test]
fn crud_null_fields_tags_notes_and_reopen() {
    let (dir, c) = database();
    let mut value = input();
    value.tags = vec!["Favorite".into(), "favorite".into(), "RPG".into()];
    value.notes_html="<p><strong>Bold</strong> <em>Italic</em> <u>Underline</u></p><ul><li>First</li></ul><ol><li>Second</li></ol><p><a href=\"https://example.com/\">Link</a></p>".into();
    let g = save_game(&c, None, value).unwrap();
    assert_eq!(g.data.tags.len(), 2);
    assert_eq!(g.igdb_id, None);
    assert_eq!(g.data.release_date, None);
    assert_eq!(g.data.cover_path, None);
    assert_eq!(g.data.rating, None);
    drop(c);
    let c = Connection::open(dir.path().join("test.db")).unwrap();
    storage::run_migrations(&c).unwrap();
    let mut loaded = get_game(&c, g.id).unwrap();
    assert!(loaded.data.notes_html.contains("<strong>Bold</strong>"));
    assert!(loaded.data.notes_html.contains("https://example.com/"));
    loaded.data.title = "Updated".into();
    loaded.data.platform_id = 2;
    loaded.data.rating = Some(5);
    loaded.data.tags = vec!["Updated".into()];
    let updated = save_game(&c, Some(g.id), loaded.data).unwrap();
    assert_eq!(updated.date_added, g.date_added);
    assert_eq!(updated.data.title, "Updated");
    assert_eq!(updated.data.platform_id, 2);
    assert_eq!(updated.data.rating, Some(5));
    assert_eq!(list_games(&c).unwrap().len(), 1);
    drop(c);
    let c = Connection::open(dir.path().join("test.db")).unwrap();
    storage::run_migrations(&c).unwrap();
    assert_eq!(get_game(&c, g.id).unwrap().data.title, "Updated");
    delete_game(&c, g.id).unwrap();
    assert!(get_game(&c, g.id).is_err());
    assert_eq!(
        c.query_row("SELECT count(*) FROM game_tags", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert_eq!(
        c.query_row("SELECT count(*) FROM tags", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
}
#[test]
fn platforms_seed_and_restrict_deletion() {
    let (_dir, c) = database();
    let platforms = list_platforms(&c).unwrap();
    assert_eq!(platforms.len(), 20);
    assert!(platforms.iter().all(|p| p.is_builtin));
    storage::run_migrations(&c).unwrap();
    assert_eq!(list_platforms(&c).unwrap().len(), 20);
    assert!(delete_platform(&c, 1).is_err());
    save_platform(&c, None, "Custom", "CUS", None).unwrap();
    let id = list_platforms(&c).unwrap().last().unwrap().id;
    save_platform(&c, Some(id), "Custom edited", "EDIT", None).unwrap();
    let mut v = input();
    v.platform_id = id;
    let g = save_game(&c, None, v).unwrap();
    assert!(delete_platform(&c, id).is_err());
    delete_game(&c, g.id).unwrap();
    delete_platform(&c, id).unwrap();
}
#[test]
fn invalid_game_does_not_change_existing_data() {
    let (_dir, c) = database();
    let game = save_game(&c, None, input()).unwrap();
    let mut bad = game.data.clone();
    bad.platform_id = 99999;
    assert!(save_game(&c, Some(game.id), bad).is_err());
    let mut bad = game.data.clone();
    bad.title = " ".into();
    assert!(save_game(&c, Some(game.id), bad).is_err());
    let mut bad = game.data.clone();
    bad.rating = Some(6);
    assert!(save_game(&c, Some(game.id), bad).is_err());
    let mut bad = game.data.clone();
    bad.release_date = Some("2025-02-29".into());
    assert!(save_game(&c, Some(game.id), bad).is_err());
    assert_eq!(get_game(&c, game.id).unwrap().data.title, "Test Game");
}
#[test]
fn sanitization_and_link_protocols() {
    let html = sanitize_notes(
        "<script>alert(1)</script><p onclick='evil()' style='color:red'>Safe <a href='javascript:evil()'>bad</a><a href='file:///C:/secret'>file</a><img src=x onerror=evil()><iframe src=x>embed</iframe><a href='https://example.com'>good</a></p>",
    );
    for bad in [
        "script",
        "onclick",
        "style=",
        "javascript:",
        "file:",
        "<img",
        "<iframe",
    ] {
        assert!(!html.contains(bad), "{html}");
    }
    assert!(html.contains("https://example.com"));
    for bad in [
        "javascript:alert(1)",
        "file:///C:/test",
        "https://user:pass@example.com",
        "relative",
        "cmd.exe",
    ] {
        assert!(validate_url(bad).is_err());
    }
    assert!(validate_url("https://example.com").is_ok());
    assert!(validate_url("http://example.com").is_ok());
}
#[test]
fn preferences_survive_reopen() {
    let (dir, c) = database();
    set_preference(&c, "library_view", "list").unwrap();
    set_preference(&c, "cover_size", "extra_large").unwrap();
    assert!(set_preference(&c, "library_view", "invalid").is_err());
    drop(c);
    let c = Connection::open(dir.path().join("test.db")).unwrap();
    let p = preferences(&c).unwrap();
    assert_eq!(p["library_view"], "list");
    assert_eq!(p["cover_size"], "extra_large");
}
#[test]
fn image_import_validation_and_shared_cover_cleanup() {
    let (dir, c) = database();
    let source = dir.path().join("source.png");
    image::RgbaImage::from_pixel(4, 4, image::Rgba([50, 150, 200, 255]))
        .save(&source)
        .unwrap();
    let path = assets::import(dir.path(), &source, "covers").unwrap();
    let destination = assets::resolve(dir.path(), &path).unwrap();
    assert!(destination.is_file());
    assert!(source.is_file());
    assert!(
        assets::data_url(dir.path(), &path)
            .unwrap()
            .starts_with("data:image/png;base64,")
    );
    let mut v = input();
    v.cover_path = Some(path.clone());
    let first = save_game(&c, None, v.clone()).unwrap();
    let second = save_game(&c, None, v).unwrap();
    delete_game(&c, first.id).unwrap();
    assets::remove_unused(&c, dir.path(), &path).unwrap();
    assert!(destination.exists());
    delete_game(&c, second.id).unwrap();
    assets::remove_unused(&c, dir.path(), &path).unwrap();
    assert!(!destination.exists());
    assert!(source.exists());
    let icon = assets::import(dir.path(), &source, "platform-icons").unwrap();
    save_platform(&c, None, "Icon platform", "IP", Some(icon.clone())).unwrap();
    assets::remove_unused(&c, dir.path(), &icon).unwrap();
    assert!(assets::resolve(dir.path(), &icon).unwrap().exists());
    std::fs::write(dir.path().join("bad.png"), b"not an image").unwrap();
    assert!(assets::import(dir.path(), &dir.path().join("bad.png"), "covers").is_err());
    for path in [
        "../source.png",
        "covers/../../source.png",
        "C:/source.png",
        "covers/not-a-uuid.png",
    ] {
        assert!(assets::resolve(dir.path(), path).is_err());
    }
}
