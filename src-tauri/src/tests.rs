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
fn account_and_all_star_values_persist_and_clear() {
    let (dir, c) = database();
    let mut value = input();
    value.account = Some("  Steam Main  ".into());
    let mut game = save_game(&c, None, value).unwrap();
    assert_eq!(game.data.account.as_deref(), Some("Steam Main"));
    for rating in 1..=5 {
        game.data.rating = Some(rating);
        game = save_game(&c, Some(game.id), game.data).unwrap();
        assert_eq!(get_game(&c, game.id).unwrap().data.rating, Some(rating));
    }
    game.data.account = Some("Steam Alt".into());
    game = save_game(&c, Some(game.id), game.data).unwrap();
    drop(c);
    let c = Connection::open(dir.path().join("test.db")).unwrap();
    storage::run_migrations(&c).unwrap();
    let mut reopened = get_game(&c, game.id).unwrap();
    assert_eq!(reopened.data.account.as_deref(), Some("Steam Alt"));
    assert_eq!(reopened.data.rating, Some(5));
    reopened.data.account = Some(" ".into());
    reopened.data.rating = None;
    let cleared = save_game(&c, Some(game.id), reopened.data).unwrap();
    assert_eq!(cleared.data.account, None);
    assert_eq!(cleared.data.rating, None);
}

#[test]
fn crud_null_fields_tags_notes_and_reopen() {
    let (dir, c) = database();
    let mut value = input();
    value.tags = vec!["Favorite".into(), "favorite".into(), "RPG".into()];
    value.notes_html="<p><strong>Bold</strong> <em>Italic</em> <u>Underline</u></p><ul><li>First</li></ul><ol><li>Second</li></ol><p><a href=\"https://example.com/\">Link</a></p>".into();
    let g = save_game(&c, None, value).unwrap();
    assert_eq!(g.data.tags.len(), 2);
    assert_eq!(g.data.igdb_id, None);
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
    assert_eq!(preferences(&c).unwrap()["library_sort"], "title_asc");
    for sort in [
        "title_asc",
        "title_desc",
        "release_desc",
        "release_asc",
        "rating_desc",
        "rating_asc",
        "added_desc",
        "added_asc",
        "platform_asc",
    ] {
        set_preference(&c, "library_sort", sort).unwrap();
    }
    assert!(set_preference(&c, "library_sort", "invalid").is_err());
    set_preference(&c, "library_view", "list").unwrap();
    set_preference(&c, "cover_size", "extra_large").unwrap();
    assert!(set_preference(&c, "library_view", "invalid").is_err());
    drop(c);
    let c = Connection::open(dir.path().join("test.db")).unwrap();
    let p = preferences(&c).unwrap();
    assert_eq!(p["library_view"], "list");
    assert_eq!(p["cover_size"], "extra_large");
    assert_eq!(p["library_sort"], "platform_asc");
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

#[test]
fn report_preferences_accept_only_known_values() {
    let (_dir, c) = database();
    for (key, value) in [
        ("report_paper", "letter"),
        ("report_paper", "a4"),
        ("report_orientation", "portrait"),
        ("report_orientation", "landscape"),
    ] {
        set_preference(&c, key, value).unwrap();
        assert_eq!(preferences(&c).unwrap()[key], value);
    }
    assert!(set_preference(&c, "report_paper", "legal").is_err());
    assert!(set_preference(&c, "report_orientation", "sideways").is_err());
    assert_eq!(preferences(&c).unwrap()["report_paper"], "a4");
}

#[test]
fn stats_panel_preference_accepts_only_booleans() {
    let (_dir, c) = database();
    set_preference(&c, "stats_open", "false").unwrap();
    assert_eq!(preferences(&c).unwrap()["stats_open"], "false");
    set_preference(&c, "stats_open", "true").unwrap();
    assert!(set_preference(&c, "stats_open", "yes").is_err());
    assert!(set_preference(&c, "stats_open", "").is_err());
    assert_eq!(preferences(&c).unwrap()["stats_open"], "true");
}

// ---- Backlog: ordered list of games whose status is Backlog ----

fn backlog_game(c: &Connection, title: &str, status: &str) -> Game {
    let mut value = input();
    value.title = title.into();
    value.play_status = status.into();
    save_game(c, None, value).unwrap()
}
/// (title, position) of every game that has a position, in order.
fn backlog(c: &Connection) -> Vec<(String, i64)> {
    let mut games: Vec<_> = list_games(c)
        .unwrap()
        .into_iter()
        .filter_map(|g| g.backlog_position.map(|p| (g.data.title, p)))
        .collect();
    games.sort_by_key(|g| g.1);
    games
}
fn order(c: &Connection) -> Vec<String> {
    backlog(c).into_iter().map(|g| g.0).collect()
}
fn positions_are_dense(c: &Connection) {
    let positions: Vec<i64> = backlog(c).iter().map(|g| g.1).collect();
    assert_eq!(positions, (1..=positions.len() as i64).collect::<Vec<_>>());
    // Only Backlog games have a position, and every Backlog game has one.
    for g in list_games(c).unwrap() {
        assert_eq!(
            g.backlog_position.is_some(),
            g.data.play_status == "Backlog",
            "{}",
            g.data.title
        );
    }
}

#[test]
fn backlog_is_a_valid_status_and_new_backlog_games_go_to_the_bottom() {
    let (_dir, c) = database();
    backlog_game(&c, "Other", "Playing");
    let a = backlog_game(&c, "A", "Backlog");
    let b = backlog_game(&c, "B", "Backlog");
    let z = backlog_game(&c, "Z", "Backlog");
    assert_eq!(
        (a.backlog_position, b.backlog_position, z.backlog_position),
        (Some(1), Some(2), Some(3))
    );
    assert_eq!(order(&c), ["A", "B", "Z"]);
    assert!(
        list_games(&c)
            .unwrap()
            .iter()
            .filter(|g| g.data.play_status != "Backlog")
            .all(|g| g.backlog_position.is_none())
    );
    positions_are_dense(&c);
}

#[test]
fn leaving_the_backlog_closes_the_gap_and_rejoining_goes_to_the_bottom() {
    let (_dir, c) = database();
    let a = backlog_game(&c, "A", "Backlog");
    let b = backlog_game(&c, "B", "Backlog");
    backlog_game(&c, "C", "Backlog");
    let mut value = get_game(&c, b.id).unwrap().data;
    value.play_status = "Playing".into();
    let moved = save_game(&c, Some(b.id), value).unwrap();
    assert_eq!(moved.backlog_position, None);
    assert_eq!(backlog(&c), [("A".into(), 1), ("C".into(), 2)]);
    positions_are_dense(&c);

    let mut value = get_game(&c, b.id).unwrap().data;
    value.play_status = "Backlog".into();
    save_game(&c, Some(b.id), value).unwrap();
    assert_eq!(order(&c), ["A", "C", "B"]);
    assert_eq!(get_game(&c, a.id).unwrap().backlog_position, Some(1));
    positions_are_dense(&c);
}

#[test]
fn editing_a_backlog_game_keeps_its_place() {
    let (_dir, c) = database();
    backlog_game(&c, "A", "Backlog");
    let b = backlog_game(&c, "B", "Backlog");
    backlog_game(&c, "C", "Backlog");
    let mut value = get_game(&c, b.id).unwrap().data;
    value.title = "B renamed".into();
    value.rating = Some(4);
    value.notes_html = "<p>x</p>".into();
    save_game(&c, Some(b.id), value).unwrap();
    assert_eq!(order(&c), ["A", "B renamed", "C"]);
}

#[test]
fn deleting_a_backlog_game_closes_the_gap() {
    let (_dir, c) = database();
    backlog_game(&c, "A", "Backlog");
    let b = backlog_game(&c, "B", "Backlog");
    backlog_game(&c, "C", "Backlog");
    delete_game(&c, b.id).unwrap();
    assert_eq!(backlog(&c), [("A".into(), 1), ("C".into(), 2)]);
    // Deleting a game that is not in the backlog leaves the order alone.
    let other = backlog_game(&c, "Other", "Paused");
    delete_game(&c, other.id).unwrap();
    assert_eq!(order(&c), ["A", "C"]);
    positions_are_dense(&c);
}

#[test]
fn reordering_writes_the_requested_order() {
    let (_dir, c) = database();
    let a = backlog_game(&c, "A", "Backlog").id;
    let b = backlog_game(&c, "B", "Backlog").id;
    let d = backlog_game(&c, "C", "Backlog").id;
    set_backlog_order(&c, &[d, a, b]).unwrap();
    assert_eq!(order(&c), ["C", "A", "B"]);
    set_backlog_order(&c, &[b, d, a]).unwrap();
    assert_eq!(order(&c), ["B", "C", "A"]);
    positions_are_dense(&c);
    // Order survives reopening the database.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("reopen.db");
    let c2 = Connection::open(&path).unwrap();
    storage::run_migrations(&c2).unwrap();
    let x = backlog_game(&c2, "X", "Backlog").id;
    let y = backlog_game(&c2, "Y", "Backlog").id;
    set_backlog_order(&c2, &[y, x]).unwrap();
    drop(c2);
    let c2 = Connection::open(&path).unwrap();
    assert_eq!(order(&c2), ["Y", "X"]);
}

#[test]
fn a_stale_or_malformed_order_is_rejected_and_changes_nothing() {
    let (_dir, c) = database();
    let a = backlog_game(&c, "A", "Backlog").id;
    let b = backlog_game(&c, "B", "Backlog").id;
    let other = backlog_game(&c, "Other", "Playing").id;
    for (label, ids) in [
        ("missing one", vec![a]),
        ("extra game", vec![a, b, other]),
        ("duplicate", vec![a, a]),
        ("unknown id", vec![a, 9999]),
        ("empty", vec![]),
        ("not in backlog", vec![other, a]),
    ] {
        assert!(set_backlog_order(&c, &ids).is_err(), "{label}");
        assert_eq!(order(&c), ["A", "B"], "{label} changed the order");
    }
    set_backlog_order(&c, &[b, a]).unwrap();
    assert_eq!(order(&c), ["B", "A"]);
}

#[test]
fn adding_to_the_backlog_appends_in_the_given_order_and_sets_status() {
    let (_dir, c) = database();
    let existing = backlog_game(&c, "Existing", "Backlog").id;
    let done = backlog_game(&c, "Done", "Completed").id;
    let fresh = backlog_game(&c, "Fresh", "Not Started").id;
    let paused = backlog_game(&c, "Paused", "Paused").id;
    let added = add_to_backlog(&c, &[paused, existing, done, fresh, done]).unwrap();
    assert_eq!(added, 3);
    assert_eq!(order(&c), ["Existing", "Paused", "Done", "Fresh"]);
    assert_eq!(get_game(&c, done).unwrap().data.play_status, "Backlog");
    positions_are_dense(&c);
}

#[test]
fn adding_an_unknown_game_adds_nothing() {
    let (_dir, c) = database();
    let a = backlog_game(&c, "A", "Not Started").id;
    assert!(add_to_backlog(&c, &[a, 9999]).is_err());
    assert_eq!(get_game(&c, a).unwrap().data.play_status, "Not Started");
    assert!(order(&c).is_empty());
    assert_eq!(add_to_backlog(&c, &[]).unwrap(), 0);
}

#[test]
fn removing_from_the_backlog_sets_the_new_status_and_closes_the_gap() {
    let (_dir, c) = database();
    backlog_game(&c, "A", "Backlog");
    let b = backlog_game(&c, "B", "Backlog").id;
    backlog_game(&c, "C", "Backlog");
    remove_from_backlog(&c, b, "Playing").unwrap();
    assert_eq!(get_game(&c, b).unwrap().data.play_status, "Playing");
    assert_eq!(backlog(&c), [("A".into(), 1), ("C".into(), 2)]);
    assert!(
        remove_from_backlog(&c, b, "Playing").is_err(),
        "not in the backlog"
    );
    let a = list_games(&c)
        .unwrap()
        .into_iter()
        .find(|g| g.data.title == "A")
        .unwrap()
        .id;
    assert!(remove_from_backlog(&c, a, "Backlog").is_err());
    assert!(remove_from_backlog(&c, a, "Nonsense").is_err());
    assert!(remove_from_backlog(&c, 9999, "Playing").is_err());
    assert_eq!(order(&c), ["A", "C"]);
    positions_are_dense(&c);
}

#[test]
fn normalizing_repairs_a_backlog_that_broke_the_invariant() {
    let (_dir, c) = database();
    let a = backlog_game(&c, "A", "Backlog").id;
    let b = backlog_game(&c, "B", "Backlog").id;
    let cc = backlog_game(&c, "C", "Backlog").id;
    let stray = backlog_game(&c, "Stray", "Playing").id;
    // Simulate an edited or foreign file: gaps, a missing position, and a stray one.
    c.execute("UPDATE games SET backlog_position=7 WHERE id=?", [a])
        .unwrap();
    c.execute("UPDATE games SET backlog_position=NULL WHERE id=?", [b])
        .unwrap();
    c.execute("UPDATE games SET backlog_position=3 WHERE id=?", [cc])
        .unwrap();
    c.execute("UPDATE games SET backlog_position=1 WHERE id=?", [stray])
        .unwrap();
    normalize_backlog(&c).unwrap();
    // Valid relative order is kept (C before A), the unplaced one goes last.
    assert_eq!(order(&c), ["C", "A", "B"]);
    positions_are_dense(&c);
    normalize_backlog(&c).unwrap();
    assert_eq!(order(&c), ["C", "A", "B"]);
}

#[test]
fn the_database_refuses_a_nonpositive_position() {
    let (_dir, c) = database();
    let a = backlog_game(&c, "A", "Backlog").id;
    assert!(
        c.execute("UPDATE games SET backlog_position=0 WHERE id=?", [a])
            .is_err()
    );
    assert!(
        c.execute("UPDATE games SET backlog_position=-3 WHERE id=?", [a])
            .is_err()
    );
}

#[test]
fn existing_libraries_upgrade_without_touching_any_game() {
    // A library created before the backlog existed (migrations 1-3 only).
    let dir = tempfile::tempdir().unwrap();
    let c = Connection::open(dir.path().join("old.db")).unwrap();
    c.execute_batch(
        "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now'))); \
         CREATE TABLE app_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);",
    )
    .unwrap();
    c.execute_batch(include_str!("../migrations/002_library.sql"))
        .unwrap();
    c.execute_batch(include_str!("../migrations/003_account.sql"))
        .unwrap();
    c.execute_batch(
        "INSERT INTO schema_migrations (version, name) VALUES (1,'foundation'),(2,'local_library'),(3,'game_account'); \
         INSERT INTO games (title, platform_id, play_status, rating) VALUES ('Old One', 1, 'Not Started', 4), ('Old Two', 1, 'Completed', NULL);",
    )
    .unwrap();
    storage::run_migrations(&c).unwrap();
    normalize_backlog(&c).unwrap();
    let games = list_games(&c).unwrap();
    assert_eq!(games.len(), 2);
    assert!(games.iter().all(|g| g.backlog_position.is_none()));
    assert_eq!(games[0].data.play_status, "Not Started");
    assert_eq!(games[0].data.rating, Some(4));
    // And the new status works on the upgraded library.
    let g = backlog_game(&c, "New", "Backlog");
    assert_eq!(g.backlog_position, Some(1));
}
