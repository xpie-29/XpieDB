use super::*;
use models::*;
#[test]
#[ignore = "Read-only Windows diagnostic; reports presence only, never credential values"]
fn windows_credential_configuration_presence() {
    keyring_core::set_default_store(windows_native_keyring_store::Store::new().unwrap());
    for identifier in ["com.gamevault.verification", "com.gamevault.desktop"] {
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
    assert_eq!(
        credential_service(identifier),
        "com.gamevault.desktop.twitch"
    );
    assert_ne!(
        credential_service(identifier),
        credential_service("com.gamevault.verification")
    );
}

#[test]
#[ignore = "Explicit Windows Credential Manager test; uses only a unique synthetic entry"]
fn windows_credentials_survive_process_restart() {
    keyring_core::set_default_store(windows_native_keyring_store::Store::new().unwrap());
    // The child reads a credential written by the parent without inheriting values.
    if let Ok(service) = std::env::var("GAMEVAULT_SYNTHETIC_CREDENTIAL_TEST") {
        assert!(service.starts_with("com.gamevault.test."));
        let loaded = auth::read(&service).unwrap().unwrap();
        assert!(loaded.client_id == "synthetic-client-id");
        assert!(loaded.client_secret == "synthetic-client-secret");
        return;
    }
    let service = format!("com.gamevault.test.{}.twitch", uuid::Uuid::new_v4());
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
            "igdb::tests::windows_credentials_survive_process_restart",
            "--ignored",
        ])
        .env("GAMEVAULT_SYNTHETIC_CREDENTIAL_TEST", &service)
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

fn mock_server(
    responses: Vec<(u16, &'static str)>,
) -> (String, std::thread::JoinHandle<Vec<String>>) {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = format!("http://{}", listener.local_addr().unwrap());
    let handle = std::thread::spawn(move || {
        let mut requests = Vec::new();
        for (status, body) in responses {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut data = Vec::new();
            let mut buffer = [0; 4096];
            loop {
                let n = stream.read(&mut buffer).unwrap();
                if n == 0 {
                    break;
                }
                data.extend_from_slice(&buffer[..n]);
                let text = String::from_utf8_lossy(&data);
                if let Some(end) = text.find("\r\n\r\n") {
                    let size = text[..end]
                        .lines()
                        .find_map(|line| {
                            line.to_lowercase()
                                .strip_prefix("content-length:")
                                .and_then(|v| v.trim().parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if data.len() >= end + 4 + size {
                        break;
                    }
                }
            }
            requests.push(String::from_utf8(data).unwrap());
            write!(stream,"HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nRetry-After: 2\r\n\r\n{body}",body.len()).unwrap();
        }
        requests
    });
    (address, handle)
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
