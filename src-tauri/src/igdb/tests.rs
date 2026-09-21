use super::*;
use crate::testutil::mock_server;
use models::*;
#[test]
#[ignore = "Read-only native-store diagnostic; reports presence only, never credential values"]
fn native_credential_configuration_presence() {
    store::init().unwrap();
    for identifier in ["com.xpiedb.verification", "com.xpiedb.desktop"] {
        let stored = auth::read(&credential_service(identifier)).unwrap();
        println!(
            "{identifier}: configured={}, client_id_present={}, client_secret_present={}",
            stored.is_some(),
            stored
                .as_ref()
                .is_some_and(|c| !c.client_id.trim().is_empty()),
            stored
                .as_ref()
                .is_some_and(|c| !c.client_secret.trim().is_empty())
        );
    }
}

#[test]
fn credential_namespace_is_identity_based_not_build_profile() {
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
    let identifier = config["identifier"].as_str().unwrap();
    assert_eq!(credential_service(identifier), "com.xpiedb.desktop.twitch");
    assert_ne!(
        credential_service(identifier),
        credential_service("com.xpiedb.verification")
    );
}

#[test]
#[ignore = "Explicit native credential store test; uses only a unique synthetic entry"]
fn native_credentials_survive_process_restart() {
    store::init().unwrap();
    // The child reads a credential written by the parent without inheriting values.
    if let Ok(service) = std::env::var("XPIEDB_SYNTHETIC_CREDENTIAL_TEST") {
        assert!(service.starts_with("com.xpiedb.test."));
        let loaded = auth::read(&service).unwrap().unwrap();
        assert!(loaded.client_id == "synthetic-client-id");
        assert!(loaded.client_secret == "synthetic-client-secret");
        return;
    }
    let service = format!("com.xpiedb.test.{}.twitch", uuid::Uuid::new_v4());
    let credentials = Credentials::new(
        "synthetic-client-id".into(),
        "synthetic-client-secret".into(),
    )
    .unwrap();
    auth::write(&service, &credentials).unwrap();
    drop(credentials);
    let outcome = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "igdb::tests::native_credentials_survive_process_restart",
            "--ignored",
        ])
        .env("XPIEDB_SYNTHETIC_CREDENTIAL_TEST", &service)
        .status();
    let cleanup = auth::clear(&service);
    assert!(cleanup.is_ok());
    assert!(auth::read(&service).unwrap().is_none());
    assert!(outcome.unwrap().success());
}

fn fixture() -> ApiGame {
    serde_json::from_str(r#"{"id":42,"name":"Synthetic Adventure","first_release_date":946684800,"platforms":[{"id":6,"name":"PC (Microsoft Windows)","slug":"win"},{"id":48,"name":"PlayStation 4","slug":"ps4"}],"genres":[{"id":1,"name":"Adventure"},{"id":2,"name":"Puzzle"}],"involved_companies":[{"company":{"id":1,"name":"Example Developer"},"developer":true},{"company":{"id":2,"name":"Example Publisher"},"publisher":true}],"release_dates":[{"platform":6,"date":1577836800},{"platform":48,"date":1609459200}]}"#).unwrap()
}
#[test]
fn credentials_validate_without_exposure() {
    assert!(Credentials::new(" ".into(), "synthetic".into()).is_err());
    assert!(Credentials::new("synthetic".into(), " ".into()).is_err());
    let c = Credentials::new(" id ".into(), " secret ".into()).unwrap();
    assert_eq!(c.client_id, "id");
    assert_eq!(c.client_secret, "secret");
    assert_eq!(
        serde_json::to_value(ConfigStatus { configured: true }).unwrap(),
        serde_json::json!({"configured":true})
    );
}
#[test]
fn token_parsing_and_expiry() {
    let now = Instant::now();
    let token = Token::parse(
        br#"{"access_token":"synthetic-token","expires_in":120,"token_type":"bearer"}"#,
        now,
    )
    .unwrap();
    assert!(token.valid(now));
    assert!(!token.valid(now + Duration::from_secs(61)));
    assert!(
        Token::parse(
            br#"{"access_token":"","expires_in":0,"token_type":"bearer"}"#,
            now
        )
        .is_err()
    );
    assert!(Token::parse(b"not json", now).is_err());
}
#[test]
fn search_parsing_and_missing_fields() {
    let values: Vec<ApiGame> = serde_json::from_str(r#"[{"id":1,"name":"Minimal"}]"#).unwrap();
    assert!(values[0].platforms.is_empty());
    assert!(values[0].cover.is_none());
    assert!(serde_json::from_str::<Vec<ApiGame>>(r#"[{"id":1}]"#).is_err());
    assert!(serde_json::from_str::<Vec<ApiGame>>(r#"{"error":"bad"}"#).is_err());
}
#[test]
fn platform_and_company_metadata() {
    let value = metadata(&fixture(), Some(48), 13).unwrap();
    assert_eq!(value.igdb_id, Some(42));
    assert_eq!(value.platform_id, 13);
    assert_eq!(value.release_date.as_deref(), Some("2021-01-01"));
    assert_eq!(value.genre.as_deref(), Some("Adventure, Puzzle"));
    assert_eq!(value.developer.as_deref(), Some("Example Developer"));
    assert_eq!(value.publisher.as_deref(), Some("Example Publisher"));
    assert!(value.account.is_none());
    assert!(value.rating.is_none());
    assert!(value.tags.is_empty());
    assert!(value.notes_html.is_empty());
    assert_eq!(value.play_status, "Not Started");
}
#[test]
fn missing_dates_and_companies() {
    let mut game = fixture();
    game.release_dates.clear();
    game.involved_companies.clear();
    let value = metadata(&game, Some(6), 19).unwrap();
    assert_eq!(value.release_date.as_deref(), Some("2000-01-01"));
    assert!(value.publisher.is_none());
    assert!(value.developer.is_none());
    game.first_release_date = None;
    assert!(metadata(&game, Some(6), 19).unwrap().release_date.is_none());
    assert!(date(i64::MAX).is_none());
}
#[test]
fn unmapped_and_invalid_platforms() {
    let c = rusqlite::Connection::open_in_memory().unwrap();
    crate::storage::run_migrations(&c).unwrap();
    let local = catalog::list_platforms(&c).unwrap();
    assert_eq!(mapped_platform(&fixture().platforms[0], &local), Some(19));
    assert_eq!(
        mapped_platform(
            &Named {
                id: 999,
                name: "Steam".into(),
                slug: "steam".into()
            },
            &local
        ),
        None
    );
    assert!(metadata(&fixture(), None, 19).is_err());
    assert!(metadata(&fixture(), Some(999), 19).is_err());
}
#[test]
fn query_and_image_identifiers_are_data() {
    assert!(search_query(" ").is_err());
    assert!(search_query("bad\nquery").is_err());
    assert!(
        search_query("a\"; limit 500;")
            .unwrap()
            .contains("a\\\"; limit 500;")
    );
    assert!(image_url("../secret", true).is_err());
    assert!(image_url("https://other.test", false).is_err());
    assert!(
        image_url("co_synthetic", false)
            .unwrap()
            .starts_with("https://images.igdb.com/")
    );
}
#[test]
fn cover_failure_leaves_metadata_usable() {
    let dir = tempfile::tempdir().unwrap();
    let value = metadata(&fixture(), Some(6), 19).unwrap();
    assert!(assets::import_bytes(dir.path(), b"not an image", "covers").is_err());
    assert_eq!(value.title, "Synthetic Adventure");
    assert!(value.cover_path.is_none());
}
#[test]
fn errors_are_generic() {
    assert!(status_error(401).contains("Authentication"));
    assert!(status_error(429).contains("rate-limited"));
    assert!(status_error(503).contains("unavailable"));
}

#[test]
fn mocked_auth_retry_and_cache() {
    let token = r#"{"access_token":"synthetic-token","expires_in":3600,"token_type":"bearer"}"#;
    let (base, server) = mock_server(vec![
        (200, token),
        (401, "{}"),
        (200, token),
        (200, "[]"),
        (200, "[]"),
    ]);
    let mut client = ClientState {
        test_base: Some(base),
        client: Some(reqwest::Client::new()),
        ..Default::default()
    };
    let credentials = Credentials::new("mock-id".into(), "mock-secret".into()).unwrap();
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async {
            assert!(
                client
                    .games(&credentials, "fields name; limit 1;".into())
                    .await
                    .unwrap()
                    .is_empty()
            );
            assert!(
                client
                    .games(&credentials, "fields name; limit 1;".into())
                    .await
                    .unwrap()
                    .is_empty()
            );
        });
    let requests = server.join().unwrap();
    assert_eq!(
        requests
            .iter()
            .filter(|r| r.starts_with("POST /token "))
            .count(),
        2
    );
    assert!(requests[0].contains("client_secret=mock-secret"));
    assert!(requests[1].contains("Bearer synthetic-token"));
}
#[test]
fn mocked_rate_limit_does_not_spin() {
    let (base, server) = mock_server(vec![
        (
            200,
            r#"{"access_token":"synthetic-token","expires_in":3600,"token_type":"bearer"}"#,
        ),
        (429, "{}"),
    ]);
    let mut client = ClientState {
        test_base: Some(base),
        client: Some(reqwest::Client::new()),
        ..Default::default()
    };
    let credentials = Credentials::new("mock".into(), "mock".into()).unwrap();
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async {
            assert!(
                client
                    .games(&credentials, "fields name;".into())
                    .await
                    .err()
                    .unwrap()
                    .contains("rate-limited")
            );
            assert!(client.pace().await.unwrap_err().contains("rate-limited"));
        });
    assert_eq!(server.join().unwrap().len(), 2);
}
#[test]
fn imported_id_and_local_edits_survive_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test.db");
    let c = rusqlite::Connection::open(&path).unwrap();
    crate::storage::run_migrations(&c).unwrap();
    let input = metadata(&fixture(), Some(6), 19).unwrap();
    let mut saved = catalog::save_game(&c, None, input).unwrap();
    saved.data.title = "Local title wins".into();
    saved.data.account = Some("Personal".into());
    saved.data.igdb_id = None;
    catalog::save_game(&c, Some(saved.id), saved.data).unwrap();
    drop(c);
    let c = rusqlite::Connection::open(path).unwrap();
    let loaded = catalog::get_game(&c, saved.id).unwrap();
    assert_eq!(loaded.data.igdb_id, Some(42));
    assert_eq!(loaded.data.title, "Local title wins");
    assert_eq!(loaded.data.account.as_deref(), Some("Personal"));
}

// ---- Steam matching through IGDB's external_games ----

const TOKEN: &str = r#"{"access_token":"synthetic-token","expires_in":3600,"token_type":"bearer"}"#;
fn steam_client(base: String) -> ClientState {
    ClientState {
        test_base: Some(base),
        client: Some(reqwest::Client::new()),
        ..Default::default()
    }
}
fn run<T>(future: impl std::future::Future<Output = T>) -> T {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(future)
}
fn row(uid: &str, id: i64, name: &str, parent: Option<i64>) -> String {
    let parent = parent.map_or(String::new(), |p| format!(r#","version_parent":{p}"#));
    format!(r#"{{"id":9{id},"uid":"{uid}","game":{{"id":{id},"name":"{name}"{parent}}}}}"#)
}

#[test]
fn steam_apps_are_matched_by_external_id_with_the_looked_up_source() {
    let rows = format!(
        "[{},{},{},{}]",
        row("620", 100, "Portal 2", None),
        row("730", 200, "Counter-Strike 2", None),
        // Not asked for: ignored.
        row("4242", 300, "Unrequested", None),
        // Present but IGDB has no game for it.
        r#"{"id":1,"uid":"999","game":null}"#,
    );
    let (base, server) = crate::testutil::mock_server(vec![
        (200, TOKEN),
        (200, r#"[{"id":1,"name":"Steam"}]"#),
        (200, Box::leak(rows.into_boxed_str())),
    ]);
    let mut client = steam_client(base);
    let credentials = Credentials::new("id".into(), "secret".into()).unwrap();
    let found = run(client.steam_matches(&credentials, &[620, 730, 999])).unwrap();
    assert_eq!(
        found
            .iter()
            .map(|m| (m.appid, m.game.id, m.game.name.as_str()))
            .collect::<Vec<_>>(),
        [(620, 100, "Portal 2"), (730, 200, "Counter-Strike 2")]
    );
    let requests = server.join().unwrap();
    assert!(requests[1].starts_with("POST /external_game_sources "));
    assert!(requests[1].contains(r#"where name = "Steam""#));
    assert!(requests[2].starts_with("POST /external_games "));
    assert!(requests[2].contains("external_game_source = 1 &"));
    assert!(requests[2].contains(r#"uid = ("620","730","999")"#));
    assert!(requests[2].contains("game.cover.image_id"));
    assert!(requests[2].contains("Bearer synthetic-token"));
    // The retired numeric `category` field is not used.
    assert!(!requests[2].contains("category"));
}

#[test]
fn the_source_id_comes_from_igdb_and_is_remembered() {
    let (base, server) = crate::testutil::mock_server(vec![
        (200, TOKEN),
        (200, r#"[{"id":57,"name":"steam"}]"#),
        (200, "[]"),
        (200, "[]"),
    ]);
    let mut client = steam_client(base);
    let credentials = Credentials::new("id".into(), "secret".into()).unwrap();
    run(async {
        client.steam_matches(&credentials, &[1]).await.unwrap();
        client.steam_matches(&credentials, &[2]).await.unwrap();
    });
    let requests = server.join().unwrap();
    // token, ONE source lookup, then two match queries using the found id.
    assert_eq!(
        requests
            .iter()
            .filter(|r| r.starts_with("POST /external_game_sources "))
            .count(),
        1
    );
    assert!(requests[2].contains("external_game_source = 57 &"));
    assert!(requests[3].contains("external_game_source = 57 &"));
}

#[test]
fn an_unknown_source_falls_back_to_the_historic_steam_id() {
    let (base, server) = crate::testutil::mock_server(vec![(200, TOKEN), (200, "[]"), (200, "[]")]);
    let mut client = steam_client(base);
    let credentials = Credentials::new("id".into(), "secret".into()).unwrap();
    run(client.steam_matches(&credentials, &[1])).unwrap();
    assert!(server.join().unwrap()[2].contains("external_game_source = 1 &"));
}

#[test]
fn large_libraries_are_matched_in_batches_of_fifty() {
    let (base, server) = crate::testutil::mock_server(vec![
        (200, TOKEN),
        (200, r#"[{"id":1,"name":"Steam"}]"#),
        (200, "[]"),
        (200, "[]"),
        (200, "[]"),
    ]);
    let mut client = steam_client(base);
    let credentials = Credentials::new("id".into(), "secret".into()).unwrap();
    let appids: Vec<u64> = (1..=120).collect();
    run(client.steam_matches(&credentials, &appids)).unwrap();
    let requests = server.join().unwrap();
    let batches: Vec<usize> = requests
        .iter()
        .filter(|r| r.starts_with("POST /external_games "))
        .map(|r| r.matches("\",\"").count() + 1)
        .collect();
    assert_eq!(batches, [50, 50, 20]);
}

#[test]
fn no_apps_means_no_network_traffic() {
    let mut client = steam_client("http://127.0.0.1:1".into());
    let credentials = Credentials::new("id".into(), "secret".into()).unwrap();
    assert!(
        run(client.steam_matches(&credentials, &[]))
            .unwrap()
            .is_empty()
    );
}

#[test]
fn the_original_game_wins_over_versions_and_bundles_sharing_an_app_id() {
    let rows = format!(
        "[{},{},{}]",
        row("10", 500, "Game Bundle", Some(400)),
        row("10", 450, "Game Deluxe", Some(400)),
        row("10", 400, "Game", None),
    );
    let (base, _server) = crate::testutil::mock_server(vec![
        (200, TOKEN),
        (200, r#"[{"id":1,"name":"Steam"}]"#),
        (200, Box::leak(rows.into_boxed_str())),
    ]);
    let mut client = steam_client(base);
    let credentials = Credentials::new("id".into(), "secret".into()).unwrap();
    let found = run(client.steam_matches(&credentials, &[10])).unwrap();
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].game.id, 400);
}

#[test]
fn malformed_rows_are_skipped_not_fatal() {
    let rows = r#"[
        {"id":1,"uid":"20","game":42},
        {"id":2,"uid":"not-a-number","game":{"id":7,"name":"Bad uid"}},
        {"id":3,"uid":"30","game":{"id":8,"name":"   "}},
        {"id":4,"uid":30,"game":{"id":9,"name":"Numeric uid ok"}},
        {"id":5,"game":{"id":10,"name":"No uid"}}
    ]"#;
    let (base, _server) = crate::testutil::mock_server(vec![
        (200, TOKEN),
        (200, r#"[{"id":1,"name":"Steam"}]"#),
        (200, rows),
    ]);
    let mut client = steam_client(base);
    let credentials = Credentials::new("id".into(), "secret".into()).unwrap();
    let found = run(client.steam_matches(&credentials, &[20, 30])).unwrap();
    assert_eq!(
        found
            .iter()
            .map(|m| (m.appid, m.game.id))
            .collect::<Vec<_>>(),
        [(30, 9)]
    );
}

#[test]
fn igdb_failures_surface_as_generic_messages() {
    let (base, _s) = crate::testutil::mock_server(vec![
        (200, TOKEN),
        (200, r#"[{"id":1,"name":"Steam"}]"#),
        (503, "{}"),
    ]);
    let mut client = steam_client(base);
    let credentials = Credentials::new("id".into(), "secret".into()).unwrap();
    let error = run(client.steam_matches(&credentials, &[1])).err().unwrap();
    assert!(error.contains("temporarily unavailable"), "{error}");
}
