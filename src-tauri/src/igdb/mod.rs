pub(crate) mod auth;
pub(crate) mod models;
pub mod store;
#[cfg(test)]
mod tests;
use crate::{
    assets,
    catalog::{self, Result},
};
use auth::{Credentials, Token};
use base64::{Engine, engine::general_purpose::STANDARD};
use models::{ApiGame, Import, SearchPlatform, SearchResult};
use serde::{Serialize, de::DeserializeOwned};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tauri::{Manager, State};
use tokio::sync::Mutex;

pub struct Igdb {
    pub(crate) inner: Mutex<ClientState>,
    thumbnails: tokio::sync::Semaphore,
}
impl Default for Igdb {
    fn default() -> Self {
        Self {
            inner: Mutex::new(ClientState::default()),
            thumbnails: tokio::sync::Semaphore::new(2),
        }
    }
}
#[derive(Default)]
pub(crate) struct ClientState {
    #[cfg(test)]
    test_base: Option<String>,
    /// IGDB's id for the Steam source, looked up once per run.
    steam_source: Option<i64>,
    token: Option<Token>,
    client: Option<reqwest::Client>,
    next_request: Option<Instant>,
    blocked_until: Option<Instant>,
}
#[derive(Serialize)]
pub struct ConfigStatus {
    configured: bool,
}
pub(crate) fn service(app: &tauri::AppHandle) -> String {
    credential_service(&app.config().identifier)
}
fn credential_service(identifier: &str) -> String {
    format!("{identifier}.twitch")
}
fn connection(app: &tauri::AppHandle) -> Result<rusqlite::Connection> {
    rusqlite::Connection::open(
        app.path()
            .app_data_dir()
            .map_err(|_| "Application data unavailable.")?
            .join("xpiedb.db"),
    )
    .map_err(|_| "Library unavailable.".into())
}
fn network_error(_: reqwest::Error) -> String {
    eprintln!("IGDB/Twitch network request failed");
    "Unable to reach IGDB/Twitch. Check your connection and try again.".into()
}
fn status_error(status: u16) -> String {
    match status {
        401 | 403 => "Authentication rejected. Check your IGDB credentials.",
        429 => "IGDB is rate-limited. Wait before trying again.",
        500..=599 => "IGDB/Twitch is temporarily unavailable. Try again later.",
        _ => "IGDB/Twitch returned an unexpected response.",
    }
    .into()
}
async fn bounded(mut response: reqwest::Response, max: usize) -> Result<Vec<u8>> {
    if response.content_length().is_some_and(|n| n > max as u64) {
        return Err("Remote response exceeded the size limit.".into());
    }
    let mut data = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        if data.len() + chunk.len() > max {
            return Err("Remote response exceeded the size limit.".into());
        }
        data.extend_from_slice(&chunk);
    }
    Ok(data)
}
impl ClientState {
    fn endpoint(&self, oauth: bool) -> String {
        if oauth {
            #[cfg(test)]
            if let Some(base) = &self.test_base {
                return format!("{base}/token");
            }
            return "https://id.twitch.tv/oauth2/token".into();
        }
        self.api("games")
    }
    /// URL of an IGDB API endpoint such as `games` or `external_games`.
    fn api(&self, path: &str) -> String {
        #[cfg(test)]
        if let Some(base) = &self.test_base {
            return format!("{base}/{path}");
        }
        format!("https://api.igdb.com/v4/{path}")
    }
    fn http(&mut self) -> Result<reqwest::Client> {
        if self.client.is_none() {
            self.client = Some(
                reqwest::Client::builder()
                    .https_only(true)
                    .redirect(reqwest::redirect::Policy::none())
                    .timeout(Duration::from_secs(20))
                    .connect_timeout(Duration::from_secs(8))
                    .user_agent("XpieDB/0.1.0")
                    .build()
                    .map_err(|_| "Could not initialize the secure HTTP client.")?,
            );
        }
        Ok(self.client.as_ref().unwrap().clone())
    }
    async fn pace(&mut self) -> Result<()> {
        if self.blocked_until.is_some_and(|t| t > Instant::now()) {
            return Err(status_error(429));
        }
        if let Some(t) = self.next_request {
            tokio::time::sleep(t.saturating_duration_since(Instant::now())).await;
        }
        self.next_request = Some(Instant::now() + Duration::from_millis(300));
        Ok(())
    }
    fn check_status(&mut self, response: &reqwest::Response) -> Result<()> {
        let status = response.status();
        if status.is_success() {
            return Ok(());
        }
        eprintln!("IGDB/Twitch request failed with HTTP {}", status.as_u16());
        if status.as_u16() == 429 {
            let seconds = response
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(60)
                .clamp(1, 3600);
            self.blocked_until = Some(Instant::now() + Duration::from_secs(seconds));
        }
        Err(status_error(status.as_u16()))
    }
    async fn token(&mut self, credentials: &Credentials) -> Result<()> {
        if self.token.as_ref().is_some_and(|t| t.valid(Instant::now())) {
            return Ok(());
        }
        self.pace().await?;
        let response = self
            .http()?
            .post(self.endpoint(true))
            .form(&[
                ("client_id", credentials.client_id.as_str()),
                ("client_secret", credentials.client_secret.as_str()),
                ("grant_type", "client_credentials"),
            ])
            .send()
            .await
            .map_err(network_error)?;
        self.check_status(&response)?;
        self.token = Some(
            Token::parse(&bounded(response, 64 * 1024).await?, Instant::now())
                .inspect_err(|_| eprintln!("Twitch token response parsing failed"))?,
        );
        Ok(())
    }
    async fn games(&mut self, credentials: &Credentials, query: String) -> Result<Vec<ApiGame>> {
        self.query("games", credentials, query).await
    }
    /// Runs an Apicalypse query against one IGDB endpoint.
    async fn query<T: DeserializeOwned>(
        &mut self,
        path: &str,
        credentials: &Credentials,
        query: String,
    ) -> Result<Vec<T>> {
        for attempt in 0..2 {
            self.token(credentials).await?;
            self.pace().await?;
            let response = self
                .http()?
                .post(self.api(path))
                .header("Client-ID", &credentials.client_id)
                .bearer_auth(&self.token.as_ref().unwrap().value)
                .header("Content-Type", "text/plain")
                .body(query.clone())
                .send()
                .await
                .map_err(network_error)?;
            if response.status().as_u16() == 401 && attempt == 0 {
                self.token = None;
                continue;
            }
            self.check_status(&response)?;
            let bytes = bounded(response, 2 * 1024 * 1024).await?;
            return serde_json::from_slice(&bytes).map_err(|_| {
                eprintln!("IGDB response parsing failed");
                "IGDB returned an unexpected response.".into()
            });
        }
        Err(status_error(401))
    }
    async fn cover(&mut self, id: &str, thumbnail: bool) -> Result<Vec<u8>> {
        let response = self
            .http()?
            .get(models::image_url(id, thumbnail)?)
            .send()
            .await
            .map_err(network_error)?;
        self.check_status(&response)?;
        let kind = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !kind.starts_with("image/") {
            return Err("Cover response was not an image.".into());
        }
        bounded(
            response,
            if thumbnail {
                1024 * 1024
            } else {
                20 * 1024 * 1024
            },
        )
        .await
    }
}
/// A Steam app that IGDB has a record for.
pub(crate) struct SteamMatch {
    pub appid: u64,
    pub game: ApiGame,
}
/// The fields an import needs, shared by every lookup that returns full games.
const GAME_FIELDS: &[&str] = &[
    "name",
    "first_release_date",
    "platforms.name",
    "platforms.slug",
    "genres.name",
    "involved_companies.company.name",
    "involved_companies.developer",
    "involved_companies.publisher",
    "release_dates.platform",
    "release_dates.date",
    "cover.image_id",
    "version_parent",
];
/// Steam app ids per IGDB request; keeps queries and responses small.
const STEAM_BATCH: usize = 50;
/// A row of IGDB's `external_games`: a store's id for a game, with the game expanded.
#[derive(serde::Deserialize)]
struct ExternalRow {
    #[serde(default)]
    uid: serde_json::Value,
    game: Option<serde_json::Value>,
}
impl ExternalRow {
    fn appid(&self) -> Option<u64> {
        match &self.uid {
            serde_json::Value::String(s) => s.trim().parse().ok(),
            serde_json::Value::Number(n) => n.as_u64(),
            _ => None,
        }
    }
    fn game(&self) -> Option<ApiGame> {
        let game: ApiGame = serde_json::from_value(self.game.clone()?).ok()?;
        (game.id > 0 && !game.name.trim().is_empty()).then_some(game)
    }
}
impl ClientState {
    /// IGDB's id for the Steam source. Looked up rather than assumed because
    /// IGDB replaced its old numeric `category` with `external_game_source`.
    async fn steam_source_id(&mut self, credentials: &Credentials) -> Result<i64> {
        if let Some(id) = self.steam_source {
            return Ok(id);
        }
        let sources: Vec<models::Named> = self
            .query(
                "external_game_sources",
                credentials,
                "fields name; where name = \"Steam\"; limit 5;".into(),
            )
            .await?;
        let id = sources
            .iter()
            .find(|s| s.name.eq_ignore_ascii_case("steam"))
            .map_or(1, |s| s.id);
        self.steam_source = Some(id);
        Ok(id)
    }
    /// Finds the IGDB game for each Steam app id it knows. Apps IGDB does not
    /// know are simply absent. When several IGDB records share an app id, the
    /// original game wins over versions and bundles.
    pub(crate) async fn steam_matches(
        &mut self,
        credentials: &Credentials,
        appids: &[u64],
    ) -> Result<Vec<SteamMatch>> {
        if appids.is_empty() {
            return Ok(Vec::new());
        }
        let source = self.steam_source_id(credentials).await?;
        let fields = GAME_FIELDS
            .iter()
            .map(|f| format!("game.{f}"))
            .collect::<Vec<_>>()
            .join(",");
        let mut best: HashMap<u64, ApiGame> = HashMap::new();
        for chunk in appids.chunks(STEAM_BATCH) {
            let uids = chunk
                .iter()
                .map(|id| format!("\"{id}\""))
                .collect::<Vec<_>>()
                .join(",");
            let query = format!(
                "fields uid,{fields}; where external_game_source = {source} & uid = ({uids}); limit 500;"
            );
            let rows: Vec<ExternalRow> = self.query("external_games", credentials, query).await?;
            for row in rows {
                let (Some(appid), Some(game)) = (row.appid(), row.game()) else {
                    continue;
                };
                if !chunk.contains(&appid) {
                    continue;
                }
                let better = best.get(&appid).is_none_or(|old| {
                    (game.version_parent.is_some(), game.id)
                        < (old.version_parent.is_some(), old.id)
                });
                if better {
                    best.insert(appid, game);
                }
            }
        }
        let mut found: Vec<_> = best
            .into_iter()
            .map(|(appid, game)| SteamMatch { appid, game })
            .collect();
        found.sort_by_key(|m| m.appid);
        Ok(found)
    }
}
/// IGDB matches for Steam app ids, or `None` when IGDB is not configured.
pub(crate) async fn steam_matches(
    app: &tauri::AppHandle,
    state: &Igdb,
    appids: &[u64],
) -> Result<Option<Vec<SteamMatch>>> {
    let Some(credentials) = auth::read(&service(app))? else {
        return Ok(None);
    };
    let mut inner = state.inner.lock().await;
    inner.steam_matches(&credentials, appids).await.map(Some)
}
/// Downloads an IGDB cover into the library's managed images; returns its path.
pub(crate) async fn download_cover(
    app: &tauri::AppHandle,
    state: &Igdb,
    image_id: &str,
) -> Result<String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "Application data unavailable.")?;
    let mut inner = state.inner.lock().await;
    let bytes = inner.cover(image_id, false).await?;
    assets::import_bytes(&root, &bytes, "covers")
}
#[tauri::command]
pub async fn igdb_config(app: tauri::AppHandle, state: State<'_, Igdb>) -> Result<ConfigStatus> {
    let _guard = state.inner.lock().await;
    Ok(ConfigStatus {
        configured: auth::read(&service(&app))?.is_some(),
    })
}
#[tauri::command]
pub async fn igdb_save_credentials(
    app: tauri::AppHandle,
    state: State<'_, Igdb>,
    client_id: String,
    client_secret: String,
) -> Result<()> {
    let credentials = Credentials::new(client_id, client_secret)?;
    let mut inner = state.inner.lock().await;
    auth::write(&service(&app), &credentials)?;
    inner.token = None;
    Ok(())
}
#[tauri::command]
pub async fn igdb_clear_credentials(app: tauri::AppHandle, state: State<'_, Igdb>) -> Result<()> {
    let mut inner = state.inner.lock().await;
    inner.token = None;
    auth::clear(&service(&app))
}
#[tauri::command]
pub async fn igdb_test(app: tauri::AppHandle, state: State<'_, Igdb>) -> Result<()> {
    let mut inner = state.inner.lock().await;
    let credentials =
        auth::read(&service(&app))?.ok_or("Configure IGDB credentials in Settings first.")?;
    inner
        .games(&credentials, "fields name; limit 1;".into())
        .await?;
    Ok(())
}
#[tauri::command]
pub async fn igdb_search(
    app: tauri::AppHandle,
    state: State<'_, Igdb>,
    query: String,
) -> Result<Vec<SearchResult>> {
    let query = models::search_query(&query)?;
    let mut inner = state.inner.lock().await;
    let credentials = auth::read(&service(&app))?
        .ok_or("Configure IGDB credentials in Settings, or enter a game manually.")?;
    let mut games = inner.games(&credentials, query).await?;
    games.sort_by_key(|g| g.version_parent.is_some());
    let platforms = catalog::list_platforms(&connection(&app)?)?;
    Ok(games
        .into_iter()
        .filter(|g| g.id > 0 && !g.name.trim().is_empty())
        .map(|g| SearchResult {
            igdb_id: g.id,
            title: g.name,
            release_year: g
                .first_release_date
                .and_then(models::date)
                .map(|d| d[..4].into()),
            thumbnail: g.cover.map(|c| c.image_id),
            platforms: g
                .platforms
                .iter()
                .map(|p| SearchPlatform {
                    id: p.id,
                    name: p.name.clone(),
                    local_id: models::mapped_platform(p, &platforms),
                })
                .collect(),
            version: g.version_parent.is_some(),
        })
        .collect())
}
#[tauri::command]
pub async fn igdb_thumbnail(state: State<'_, Igdb>, image_id: String) -> Result<String> {
    let _permit = state
        .thumbnails
        .acquire()
        .await
        .map_err(|_| "Thumbnail unavailable.")?;
    let bytes = ClientState::default().cover(&image_id, true).await?;
    if image::guess_format(&bytes).ok() != Some(image::ImageFormat::Jpeg) {
        return Err("Thumbnail unavailable.".into());
    }
    Ok(format!("data:image/jpeg;base64,{}", STANDARD.encode(bytes)))
}
#[tauri::command]
pub async fn igdb_import(
    app: tauri::AppHandle,
    state: State<'_, Igdb>,
    igdb_id: i64,
    remote_platform: Option<i64>,
    local_platform: i64,
) -> Result<Import> {
    if igdb_id <= 0 {
        return Err("Invalid IGDB identifier.".into());
    }
    if !catalog::list_platforms(&connection(&app)?)?
        .iter()
        .any(|p| p.id == local_platform)
    {
        return Err("Choose an existing XpieDB platform.".into());
    }
    let mut inner = state.inner.lock().await;
    let credentials =
        auth::read(&service(&app))?.ok_or("Configure IGDB credentials in Settings first.")?;
    let games = inner.games(&credentials,format!("fields name,first_release_date,platforms.name,platforms.slug,genres.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,release_dates.platform,release_dates.date,cover.image_id; where id = {igdb_id}; limit 1;")).await?;
    let game = games
        .first()
        .filter(|g| g.id == igdb_id)
        .ok_or("IGDB game was not found.")?;
    let mut input = models::metadata(game, remote_platform, local_platform)?;
    let mut warning = None;
    if let Some(cover) = &game.cover {
        let root = app
            .path()
            .app_data_dir()
            .map_err(|_| "Application data unavailable.")?;
        match inner
            .cover(&cover.image_id, false)
            .await
            .and_then(|bytes| assets::import_bytes(&root, &bytes, "covers"))
        {
            Ok(path) => input.cover_path = Some(path),
            Err(_) => {
                eprintln!("IGDB cover import failed");
                warning=Some("Metadata is ready, but the cover could not be downloaded. You can choose a local cover.".into());
            }
        }
    }
    Ok(Import { input, warning })
}
