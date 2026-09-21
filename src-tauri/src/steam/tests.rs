use super::api::*;
use super::*;
use crate::{storage, testutil::mock_server};
use serde_json::json;

const KEY: &str = "0123456789ABCDEF0123456789abcdef";
const ID: u64 = 76561197960265729;

fn run<T>(future: impl std::future::Future<Output = T>) -> T {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(future)
}
fn leak(text: String) -> &'static str {
    Box::leak(text.into_boxed_str())
}
fn api_game(value: serde_json::Value) -> igdb::models::ApiGame {
    serde_json::from_value(value).unwrap()
}
fn candidate(
    appid: u64,
    name: &str,
    minutes: u64,
    game: Option<igdb::models::ApiGame>,
) -> Candidate {
    Candidate {
        appid,
        steam_name: name.into(),
        playtime_minutes: minutes,
        game,
    }
}
fn options() -> ImportOptions {
    ImportOptions {
        backlog_unplayed: false,
        account: None,
    }
}
fn database() -> (tempfile::TempDir, Connection) {
    let dir = tempfile::tempdir().unwrap();
    let c = Connection::open(dir.path().join("test.db")).unwrap();
    c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    storage::run_migrations(&c).unwrap();
    (dir, c)
}
fn owned_json(games: serde_json::Value) -> String {
    json!({"response": {"game_count": 1, "games": games}}).to_string()
}

// ---- profile input ----

#[test]
fn profiles_are_accepted_as_ids_links_or_custom_names() {
    let id = Profile::Id(ID);
    for input in [
        "76561197960265729",
        "  76561197960265729  ",
        "https://steamcommunity.com/profiles/76561197960265729",
        "https://steamcommunity.com/profiles/76561197960265729/",
        "http://www.steamcommunity.com/profiles/76561197960265729/games/?tab=all",
        "steamcommunity.com/profiles/76561197960265729",
    ] {
        assert_eq!(Profile::parse(input).unwrap(), id, "{input}");
    }
    for (input, name) in [
        ("https://steamcommunity.com/id/gaben", "gaben"),
        ("https://steamcommunity.com/id/some_name-1/", "some_name-1"),
        ("steamcommunity.com/id/gaben/games", "gaben"),
        ("gaben", "gaben"),
        ("My-Name_42", "My-Name_42"),
    ] {
        assert_eq!(
            Profile::parse(input).unwrap(),
            Profile::Vanity(name.into()),
            "{input}"
        );
    }
}

#[test]
fn unusable_profile_input_is_rejected_with_help() {
    for input in [
        "",
        "   ",
        "a",
        "has space",
        "https://evil.example/profiles/76561197960265729",
        "https://steamcommunity.com.evil.example/id/gaben",
        "https://user:pass@steamcommunity.com/id/gaben",
        "https://steamcommunity.com/",
        "https://steamcommunity.com/id/",
        "https://steamcommunity.com/id/bad name",
        "https://steamcommunity.com/groups/somegroup",
        "javascript:alert(1)",
        "ftp://steamcommunity.com/id/gaben",
        &"x".repeat(300),
        "line\nbreak",
    ] {
        assert!(Profile::parse(input).is_err(), "should reject {input:?}");
    }
    assert!(
        Profile::parse("bad input!")
            .unwrap_err()
            .contains("Steam ID")
    );
}

#[test]
fn credentials_need_a_32_character_hex_key_and_a_usable_profile() {
    let ok = Credentials::new(format!("  {KEY}  "), " gaben ".into()).unwrap();
    assert_eq!(ok.api_key, KEY);
    assert_eq!(ok.profile, "gaben");
    for key in [
        "",
        "short",
        &"g".repeat(32),
        &"a".repeat(31),
        &"a".repeat(33),
        "0123456789ABCDEF0123456789abcde!",
    ] {
        assert!(
            Credentials::new(key.into(), "gaben".into()).is_err(),
            "{key}"
        );
    }
    assert!(Credentials::new(KEY.into(), "".into()).is_err());
    assert!(Credentials::new(KEY.into(), "not a profile!".into()).is_err());
}

#[test]
fn the_steam_credential_namespace_is_separate_from_igdb() {
    assert_eq!(
        credential_service("com.xpiedb.desktop"),
        "com.xpiedb.desktop.steam"
    );
    assert_ne!(
        credential_service("com.xpiedb.desktop"),
        "com.xpiedb.desktop.twitch"
    );
}

// ---- reading Steam's responses ----

#[test]
fn owned_games_are_read_with_names_and_play_time() {
    let json: serde_json::Value = serde_json::from_str(&owned_json(json!([
        {"appid": 620, "name": "Portal 2", "playtime_forever": 125},
        {"appid": 730, "name": "  Counter-Strike\n 2 ", "playtime_forever": 0},
        {"appid": 10, "name": "No playtime field"},
    ])))
    .unwrap();
    assert_eq!(
        parse_owned(&json).unwrap(),
        [
            OwnedGame {
                appid: 620,
                name: "Portal 2".into(),
                playtime_minutes: 125
            },
            OwnedGame {
                appid: 730,
                name: "Counter-Strike 2".into(),
                playtime_minutes: 0
            },
            OwnedGame {
                appid: 10,
                name: "No playtime field".into(),
                playtime_minutes: 0
            },
        ]
    );
}

#[test]
fn a_private_profile_gets_clear_instructions_but_an_empty_library_is_fine() {
    let private = json!({"response": {}});
    let error = parse_owned(&private).unwrap_err();
    assert!(error.contains("Game details"), "{error}");
    assert!(error.contains("Public"));
    let empty = json!({"response": {"game_count": 0}});
    assert_eq!(parse_owned(&empty).unwrap(), []);
    assert!(parse_owned(&json!({"nope": 1})).is_err());
    assert!(parse_owned(&json!([1, 2])).is_err());
    assert!(parse_owned(&json!({"response": "text"})).is_err());
}

#[test]
fn odd_entries_are_skipped_or_cleaned() {
    let long = "x".repeat(400);
    let json = json!({"response": {"game_count": 6, "games": [
        {"appid": 1, "name": "Good"},
        {"appid": 1, "name": "Duplicate appid"},
        {"appid": "2", "name": "String appid"},
        {"name": "No appid"},
        {"appid": 3},
        {"appid": 4, "name": "   "},
        {"appid": 5, "name": long},
        {"appid": 6, "name": "Tab\there\u{7}bell"},
    ]}});
    let owned = parse_owned(&json).unwrap();
    assert_eq!(owned.iter().map(|g| g.appid).collect::<Vec<_>>(), [1, 5, 6]);
    assert_eq!(owned[1].name.len(), 300);
    assert_eq!(owned[2].name, "Tab here bell");
}

// ---- the HTTP client ----

#[test]
fn owned_games_are_requested_with_the_expected_parameters() {
    let (base, server) = mock_server(vec![(
        200,
        leak(owned_json(json!([{"appid": 620, "name": "Portal 2"}]))),
    )]);
    let games = run(SteamClient::for_test(base).owned_games(KEY, ID)).unwrap();
    assert_eq!(games.len(), 1);
    let request = &server.join().unwrap()[0];
    let line = request.lines().next().unwrap();
    assert!(
        line.starts_with("GET /IPlayerService/GetOwnedGames/v1/?"),
        "{line}"
    );
    for expected in [
        format!("key={KEY}"),
        format!("steamid={ID}"),
        "include_appinfo=1".into(),
        "include_played_free_games=1".into(),
    ] {
        assert!(line.contains(&expected), "{line} lacks {expected}");
    }
}

#[test]
fn a_custom_name_is_resolved_to_an_id() {
    let ok = format!(r#"{{"response":{{"success":1,"steamid":"{ID}"}}}}"#);
    let (base, server) = mock_server(vec![
        (200, leak(ok)),
        (200, r#"{"response":{"success":42,"message":"No match"}}"#),
        (200, r#"{"response":{"success":1,"steamid":"not-an-id"}}"#),
        (200, r#"{"unexpected":true}"#),
    ]);
    let client = SteamClient::for_test(base);
    assert_eq!(run(client.resolve_vanity(KEY, "gaben")).unwrap(), ID);
    assert!(
        run(client.resolve_vanity(KEY, "nobody"))
            .unwrap_err()
            .contains("no profile")
    );
    assert!(run(client.resolve_vanity(KEY, "odd")).is_err());
    assert!(run(client.resolve_vanity(KEY, "odd2")).is_err());
    let requests = server.join().unwrap();
    assert!(requests[0].starts_with("GET /ISteamUser/ResolveVanityURL/v1/?"));
    assert!(
        requests[0]
            .lines()
            .next()
            .unwrap()
            .contains("vanityurl=gaben")
    );
}

#[test]
fn steam_id_needs_no_lookup_but_names_do() {
    let client = SteamClient::for_test("http://127.0.0.1:1".into());
    // An id never touches the network (the port above is closed).
    assert_eq!(run(client.steam_id(KEY, &Profile::Id(ID))).unwrap(), ID);
    assert!(run(client.steam_id(KEY, &Profile::Vanity("gaben".into()))).is_err());
}

#[test]
fn the_display_name_is_best_effort() {
    let (base, _s) = mock_server(vec![
        (
            200,
            r#"{"response":{"players":[{"personaname":"  Some\nPlayer "}]}}"#,
        ),
        (200, r#"{"response":{"players":[]}}"#),
        (500, "{}"),
    ]);
    let client = SteamClient::for_test(base);
    assert_eq!(
        run(client.display_name(KEY, ID)),
        Some("Some Player".into())
    );
    assert_eq!(run(client.display_name(KEY, ID)), None);
    assert_eq!(run(client.display_name(KEY, ID)), None);
}

#[test]
fn failures_are_generic_and_never_contain_the_api_key() {
    for (status, expected) in [
        (401, "rejected the API key"),
        (403, "rejected the API key"),
        (429, "rate-limiting"),
        (503, "temporarily unavailable"),
        (418, "unexpected response"),
    ] {
        let (base, _s) = mock_server(vec![(status, "{}")]);
        let error = run(SteamClient::for_test(base).owned_games(KEY, ID)).unwrap_err();
        assert!(error.contains(expected), "{status}: {error}");
        assert!(!error.contains(KEY) && !error.contains("key="), "{error}");
    }
    // Unreachable server and unreadable body.
    let error =
        run(SteamClient::for_test("http://127.0.0.1:1".into()).owned_games(KEY, ID)).unwrap_err();
    assert!(
        error.contains("Unable to reach Steam") && !error.contains(KEY),
        "{error}"
    );
    let (base, _s) = mock_server(vec![(200, "<html>not json</html>")]);
    let error = run(SteamClient::for_test(base).owned_games(KEY, ID)).unwrap_err();
    assert!(
        error.contains("unexpected response") && !error.contains(KEY),
        "{error}"
    );
}

// ---- planning and duplicates ----

fn saved(c: &Connection, title: &str, platform: i64, igdb_id: Option<i64>) -> Game {
    catalog::save_game(
        c,
        None,
        GameInput {
            title: title.into(),
            platform_id: platform,
            igdb_id,
            media_type: "Digital".into(),
            play_status: "Not Started".into(),
            ..Default::default()
        },
    )
    .unwrap()
}

#[test]
fn a_game_is_a_duplicate_only_on_the_steam_platform() {
    let (_dir, c) = database();
    let existing = vec![
        saved(&c, "Portal 2", STEAM_PLATFORM_ID, Some(72)),
        saved(&c, "Half-Life", STEAM_PLATFORM_ID, None),
        saved(&c, "Elsewhere Only", 13, Some(999)),
    ];
    // Same IGDB game (even under a different title), same title, or both.
    assert!(already_have(&existing, 18, Some(72), "Portal Two"));
    assert!(already_have(&existing, 18, None, "Portal 2"));
    assert!(already_have(&existing, 18, Some(1), "half-life"));
    // Owned on another platform is not a duplicate of the Steam copy.
    assert!(!already_have(&existing, 18, Some(999), "Elsewhere Only"));
    assert!(!already_have(&existing, 18, None, "Something New"));
    assert!(!already_have(&[], 18, Some(1), "Anything"));
}

#[test]
fn titles_match_ignoring_case_accents_spacing_and_trademark_marks() {
    let (_dir, c) = database();
    let existing = vec![saved(&c, "Pokémon   Café™", STEAM_PLATFORM_ID, None)];
    for title in [
        "pokemon cafe",
        "POKÉMON CAFÉ®",
        "Pokémon Café",
        "  pokemon\tcafe  ",
    ] {
        assert!(already_have(&existing, 18, None, title), "{title}");
    }
    assert!(!already_have(&existing, 18, None, "Pokémon Café 2"));
}

#[test]
fn planning_pairs_games_with_matches_and_sorts_by_title() {
    let owned = vec![
        OwnedGame {
            appid: 3,
            name: "zeta".into(),
            playtime_minutes: 0,
        },
        OwnedGame {
            appid: 1,
            name: "Alpha steam name".into(),
            playtime_minutes: 10,
        },
        OwnedGame {
            appid: 2,
            name: "beta".into(),
            playtime_minutes: 5,
        },
    ];
    let matches = vec![igdb::SteamMatch {
        appid: 1,
        game: api_game(json!({"id": 7, "name": "Alpha (IGDB)"})),
    }];
    let planned = plan(owned, matches);
    assert_eq!(
        planned
            .iter()
            .map(|c| c.title().to_string())
            .collect::<Vec<_>>(),
        ["Alpha (IGDB)", "beta", "zeta"]
    );
    assert!(planned[0].game.is_some() && planned[1].game.is_none());
    let shown = item(&planned[0], &[], 18);
    assert!(shown.matched && !shown.duplicate);
    assert_eq!(shown.playtime_minutes, 10);
}

#[test]
fn list_items_show_year_genre_and_duplicate_status() {
    let (_dir, c) = database();
    let existing = vec![saved(&c, "Portal 2", 18, Some(72))];
    let game = api_game(
        json!({"id": 72, "name": "Portal 2", "first_release_date": 1302566400, "genres": [{"id": 1, "name": "Puzzle"}, {"id": 2, "name": "Adventure"}]}),
    );
    let shown = item(&candidate(620, "Portal 2", 0, Some(game)), &existing, 18);
    assert_eq!(shown.year.as_deref(), Some("2011"));
    assert_eq!(shown.genre.as_deref(), Some("Puzzle, Adventure"));
    assert!(shown.duplicate && shown.matched);
    let bare = item(&candidate(9, "Unmatched", 0, None), &existing, 18);
    assert!(!bare.matched && bare.year.is_none() && bare.genre.is_none() && !bare.duplicate);
}

// ---- building game records ----

#[test]
fn matched_games_use_igdb_data_and_a_pc_release_date() {
    let game = api_game(json!({
        "id": 72, "name": "Portal 2", "first_release_date": 1302566400,
        "platforms": [{"id": 6, "name": "PC (Microsoft Windows)", "slug": "win"}, {"id": 12, "name": "Xbox 360", "slug": "xbox360"}],
        "release_dates": [{"platform": 12, "date": 1302566400}, {"platform": 6, "date": 1302480000}],
        "genres": [{"id": 1, "name": "Puzzle"}],
        "involved_companies": [{"company": {"id": 1, "name": "Valve"}, "developer": true, "publisher": true}],
    }));
    let input = build_input(
        &candidate(620, "Portal 2 (Steam name)", 90, Some(game)),
        18,
        &options(),
    )
    .unwrap();
    assert_eq!(input.igdb_id, Some(72));
    assert_eq!(input.title, "Portal 2");
    assert_eq!(input.platform_id, 18);
    assert_eq!(input.media_type, "Digital");
    assert_eq!(input.play_status, "Not Started");
    assert_eq!(input.release_date.as_deref(), Some("2011-04-11")); // the PC date, not Xbox's
    assert_eq!(input.genre.as_deref(), Some("Puzzle"));
    assert_eq!(input.developer.as_deref(), Some("Valve"));
    assert_eq!(input.publisher.as_deref(), Some("Valve"));
}

#[test]
fn mac_or_linux_only_games_still_import() {
    for platform in [(14, "mac"), (3, "linux"), (99, "other")] {
        let game = api_game(
            json!({"id": 5, "name": "Odd One", "platforms": [{"id": platform.0, "name": "X", "slug": platform.1}]}),
        );
        assert!(
            build_input(&candidate(5, "Odd One", 0, Some(game)), 18, &options()).is_ok(),
            "{platform:?}"
        );
    }
    let no_platforms = api_game(json!({"id": 6, "name": "No platforms listed"}));
    assert!(build_input(&candidate(6, "x", 0, Some(no_platforms)), 18, &options()).is_ok());
}

#[test]
fn unmatched_games_import_with_just_the_steam_title() {
    let input = build_input(&candidate(9, "Obscure Game", 0, None), 18, &options()).unwrap();
    assert_eq!(input.title, "Obscure Game");
    assert_eq!(input.igdb_id, None);
    assert_eq!(input.platform_id, 18);
    assert_eq!(input.media_type, "Digital");
    assert!(input.genre.is_none() && input.release_date.is_none() && input.cover_path.is_none());
    let long = build_input(&candidate(9, &"y".repeat(500), 0, None), 18, &options()).unwrap();
    assert_eq!(long.title.len(), 300);
}

#[test]
fn only_unplayed_games_go_to_the_backlog_when_asked() {
    let with = ImportOptions {
        backlog_unplayed: true,
        account: Some("Main".into()),
    };
    let unplayed = build_input(&candidate(1, "Unplayed", 0, None), 18, &with).unwrap();
    let played = build_input(&candidate(2, "Played", 1, None), 18, &with).unwrap();
    assert_eq!(unplayed.play_status, "Backlog");
    assert_eq!(played.play_status, "Not Started");
    assert_eq!(unplayed.account.as_deref(), Some("Main"));
    let without = build_input(&candidate(1, "Unplayed", 0, None), 18, &options()).unwrap();
    assert_eq!(without.play_status, "Not Started");
    assert_eq!(without.account, None);
}

// ---- saving ----

#[test]
fn importing_adds_games_and_skips_ones_already_in_the_library() {
    let (dir, c) = database();
    let mut existing = catalog::list_games(&c).unwrap();
    let first = candidate(1, "Fresh Game", 0, None);
    let added = save_candidate(&c, dir.path(), &mut existing, &first, 18, &options(), None);
    assert_eq!(added.status, "added");
    assert_eq!(added.message, None);
    assert_eq!(catalog::list_games(&c).unwrap().len(), 1);

    // Again: skipped, and the stored game is untouched.
    let mut stored = catalog::list_games(&c).unwrap().remove(0);
    stored.data.rating = Some(5);
    stored.data.notes_html = "<p>My notes</p>".into();
    catalog::save_game(&c, Some(stored.id), stored.data).unwrap();
    let mut existing = catalog::list_games(&c).unwrap();
    let again = save_candidate(&c, dir.path(), &mut existing, &first, 18, &options(), None);
    assert_eq!(
        (again.status, again.message.as_deref()),
        ("skipped", Some("Already in your library."))
    );
    let kept = catalog::list_games(&c).unwrap();
    assert_eq!(kept.len(), 1);
    assert_eq!(kept[0].data.rating, Some(5));
    assert_eq!(kept[0].data.notes_html, "<p>My notes</p>");
}

#[test]
fn the_same_game_twice_in_one_import_is_added_once() {
    let (dir, c) = database();
    let mut existing = catalog::list_games(&c).unwrap();
    let a = save_candidate(
        &c,
        dir.path(),
        &mut existing,
        &candidate(1, "Twin", 0, None),
        18,
        &options(),
        None,
    );
    let b = save_candidate(
        &c,
        dir.path(),
        &mut existing,
        &candidate(2, "twin", 0, None),
        18,
        &options(),
        None,
    );
    assert_eq!((a.status, b.status), ("added", "skipped"));
    assert_eq!(catalog::list_games(&c).unwrap().len(), 1);
}

#[test]
fn a_failed_cover_download_still_adds_the_game_with_a_note() {
    let (dir, c) = database();
    let mut existing = Vec::new();
    let game = api_game(json!({"id": 5, "name": "Has Cover", "cover": {"image_id": "co1abc"}}));
    let outcome = save_candidate(
        &c,
        dir.path(),
        &mut existing,
        &candidate(5, "Has Cover", 0, Some(game)),
        18,
        &options(),
        Some(Err("network".into())),
    );
    assert_eq!(outcome.status, "added");
    assert!(outcome.message.unwrap().contains("without a cover"));
    let saved = catalog::list_games(&c).unwrap();
    assert_eq!(saved[0].data.cover_path, None);
    assert_eq!(saved[0].data.igdb_id, Some(5));
}

#[test]
fn a_downloaded_cover_is_attached_and_a_failed_save_cleans_it_up() {
    let (dir, c) = database();
    let png = {
        let mut bytes = Vec::new();
        image::RgbaImage::from_pixel(2, 2, image::Rgba([9, 9, 9, 255]))
            .write_to(
                &mut std::io::Cursor::new(&mut bytes),
                image::ImageFormat::Png,
            )
            .unwrap();
        bytes
    };
    let path = assets::import_bytes(dir.path(), &png, "covers").unwrap();
    let mut existing = Vec::new();
    let ok = save_candidate(
        &c,
        dir.path(),
        &mut existing,
        &candidate(1, "With Art", 0, None),
        18,
        &options(),
        Some(Ok(path.clone())),
    );
    assert_eq!(ok.status, "added");
    assert_eq!(
        catalog::list_games(&c).unwrap()[0]
            .data
            .cover_path
            .as_deref(),
        Some(path.as_str())
    );

    // An unsavable game (nonexistent platform) removes the cover it downloaded.
    let orphan = assets::import_bytes(dir.path(), &png, "covers").unwrap();
    let failed = save_candidate(
        &c,
        dir.path(),
        &mut existing,
        &candidate(2, "Bad Platform", 0, None),
        9999,
        &options(),
        Some(Ok(orphan.clone())),
    );
    assert_eq!(failed.status, "failed");
    assert!(!assets::resolve(dir.path(), &orphan).unwrap().exists());
    assert!(assets::resolve(dir.path(), &path).unwrap().exists());
}

#[test]
fn unplayed_games_land_at_the_bottom_of_the_backlog_in_order() {
    let (dir, c) = database();
    let mut existing = Vec::new();
    let with = ImportOptions {
        backlog_unplayed: true,
        account: None,
    };
    for (id, name, minutes) in [(1, "One", 0), (2, "Two", 30), (3, "Three", 0)] {
        save_candidate(
            &c,
            dir.path(),
            &mut existing,
            &candidate(id, name, minutes, None),
            18,
            &with,
            None,
        );
    }
    let mut queue: Vec<_> = catalog::list_games(&c)
        .unwrap()
        .into_iter()
        .filter_map(|g| g.backlog_position.map(|p| (p, g.data.title)))
        .collect();
    queue.sort();
    assert_eq!(queue, [(1, "One".to_string()), (2, "Three".to_string())]);
}

#[test]
fn imported_games_are_digital_steam_games_with_the_account_label() {
    let (dir, c) = database();
    let mut existing = Vec::new();
    let with = ImportOptions {
        backlog_unplayed: false,
        account: Some("  Steam Main  ".into()),
    };
    save_candidate(
        &c,
        dir.path(),
        &mut existing,
        &candidate(1, "Labelled", 0, None),
        18,
        &with,
        None,
    );
    let game = catalog::list_games(&c).unwrap().remove(0);
    assert_eq!(
        (game.data.platform_id, game.data.media_type.as_str()),
        (18, "Digital")
    );
    assert_eq!(game.data.account.as_deref(), Some("Steam Main"));
}

#[test]
fn the_steam_platform_must_be_the_seeded_one() {
    let (_dir, c) = database();
    assert_eq!(steam_platform(&c).unwrap(), 18);
    c.execute("UPDATE platforms SET name='Renamed' WHERE id=18", [])
        .unwrap();
    assert!(steam_platform(&c).is_err());
}
