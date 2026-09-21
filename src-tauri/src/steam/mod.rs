//! Import a Steam library, matched to IGDB for covers and details.
//!
//! Import only ever adds games: anything already in the library (same IGDB game
//! or same title on the Steam platform) is skipped, never changed, so personal
//! edits are safe and the import can be repeated to pick up new purchases.
pub mod api;
#[cfg(test)]
mod tests;

use crate::{
    assets,
    catalog::{self, Game, GameInput, Result},
    commands,
    igdb::{self, Igdb, models},
};
use api::{Credentials, OwnedGame, Profile, SteamClient};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::Path, sync::Mutex};
use tauri::{AppHandle, State};

/// The built-in Steam platform in the seeded platform list.
const STEAM_PLATFORM_ID: i64 = 18;
/// IGDB platform ids for PC (Windows), Mac and Linux, in order of preference
/// when choosing which release date to use for a Steam game.
const IGDB_PC_PLATFORMS: [i64; 3] = [6, 14, 3];

fn service(app: &AppHandle) -> String {
    credential_service(&app.config().identifier)
}
fn credential_service(identifier: &str) -> String {
    format!("{identifier}.steam")
}

/// The Steam key and profile live in the OS credential store, like IGDB's.
mod creds {
    use super::*;
    fn entry(service: &str) -> Result<keyring_core::Entry> {
        keyring_core::Entry::new_with_modifiers(service, "steam", &igdb::store::modifiers())
            .map_err(|_| format!("{} is unavailable.", igdb::store::NAME))
    }
    pub fn read(service: &str) -> Result<Option<Credentials>> {
        match entry(service)?.get_password() {
            Ok(value) => serde_json::from_str(&value)
                .map(Some)
                .map_err(|_| "Stored Steam settings are invalid; update them in Settings.".into()),
            Err(keyring_core::Error::NoEntry) => Ok(None),
            Err(_) => Err(format!(
                "{} could not read the Steam settings.",
                igdb::store::NAME
            )),
        }
    }
    pub fn write(service: &str, credentials: &Credentials) -> Result<()> {
        entry(service)?
            .set_password(
                &serde_json::to_string(credentials)
                    .map_err(|_| "Could not encode the Steam settings.")?,
            )
            .map_err(|_| format!("{} could not save the Steam settings.", igdb::store::NAME))
    }
    pub fn clear(service: &str) -> Result<()> {
        match entry(service)?.delete_credential() {
            Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
            Err(_) => Err(format!(
                "{} could not clear the Steam settings.",
                igdb::store::NAME
            )),
        }
    }
}

/// A Steam game found in the account, with its IGDB record when there is one.
#[derive(Clone)]
struct Candidate {
    appid: u64,
    steam_name: String,
    playtime_minutes: u64,
    game: Option<igdb::models::ApiGame>,
}
impl Candidate {
    /// IGDB's name when matched (consistent with the IGDB flow), else Steam's.
    fn title(&self) -> &str {
        self.game
            .as_ref()
            .map_or(self.steam_name.as_str(), |g| g.name.trim())
    }
}

#[derive(Default)]
pub struct Steam {
    candidates: Mutex<Vec<Candidate>>,
    running: tokio::sync::Mutex<()>,
}

#[derive(Serialize)]
pub struct SteamItem {
    appid: u64,
    title: String,
    year: Option<String>,
    genre: Option<String>,
    playtime_minutes: u64,
    matched: bool,
    duplicate: bool,
}
#[derive(Serialize)]
pub struct SteamLibrary {
    account_name: Option<String>,
    /// False when IGDB is not configured, so nothing could be matched.
    matching_available: bool,
    items: Vec<SteamItem>,
}
#[derive(Deserialize)]
pub struct ImportOptions {
    /// Give games with no recorded play time the Backlog status.
    pub backlog_unplayed: bool,
    /// Optional account label stored on every imported game.
    pub account: Option<String>,
}
#[derive(Serialize, Debug, PartialEq)]
pub struct Outcome {
    appid: u64,
    title: String,
    /// "added", "skipped" (already in the library), or "failed".
    status: &'static str,
    message: Option<String>,
}

/// Comparison key for titles: case, accents, spacing and trademark marks ignored.
fn title_key(title: &str) -> String {
    crate::report::sort_key(&title.replace(['™', '®', '©'], ""))
}
/// True when the library already has this game on the Steam platform.
fn already_have(existing: &[Game], platform: i64, igdb_id: Option<i64>, title: &str) -> bool {
    let key = title_key(title);
    existing.iter().any(|g| {
        g.data.platform_id == platform
            && (igdb_id.is_some() && g.data.igdb_id == igdb_id || title_key(&g.data.title) == key)
    })
}
fn steam_platform(connection: &Connection) -> Result<i64> {
    catalog::list_platforms(connection)?
        .into_iter()
        .find(|p| p.id == STEAM_PLATFORM_ID && p.is_builtin && p.name == "Steam")
        .map(|p| p.id)
        .ok_or_else(|| "The built-in Steam platform is missing.".into())
}

/// Combines the account's games with IGDB matches, sorted by title.
fn plan(owned: Vec<OwnedGame>, matches: Vec<igdb::SteamMatch>) -> Vec<Candidate> {
    let mut by_app: HashMap<u64, igdb::models::ApiGame> =
        matches.into_iter().map(|m| (m.appid, m.game)).collect();
    let mut candidates: Vec<Candidate> = owned
        .into_iter()
        .map(|o| Candidate {
            game: by_app.remove(&o.appid),
            appid: o.appid,
            steam_name: o.name,
            playtime_minutes: o.playtime_minutes,
        })
        .collect();
    candidates.sort_by(|a, b| {
        title_key(a.title())
            .cmp(&title_key(b.title()))
            .then(a.appid.cmp(&b.appid))
    });
    candidates
}
fn item(candidate: &Candidate, existing: &[Game], platform: i64) -> SteamItem {
    let game = candidate.game.as_ref();
    let date = game
        .and_then(|g| g.first_release_date)
        .and_then(models::date);
    let genres: Vec<_> = game
        .map(|g| g.genres.iter().map(|x| x.name.as_str()).collect())
        .unwrap_or_default();
    SteamItem {
        appid: candidate.appid,
        title: candidate.title().into(),
        year: date.map(|d| d[..4].to_string()),
        genre: (!genres.is_empty()).then(|| genres.join(", ")),
        playtime_minutes: candidate.playtime_minutes,
        matched: game.is_some(),
        duplicate: already_have(existing, platform, game.map(|g| g.id), candidate.title()),
    }
}

/// The release date of a Steam game comes from its PC, Mac or Linux release.
fn pc_platform(game: &igdb::models::ApiGame) -> Option<i64> {
    IGDB_PC_PLATFORMS
        .into_iter()
        .find(|id| game.platforms.iter().any(|p| p.id == *id))
        .or_else(|| game.platforms.first().map(|p| p.id))
}
fn build_input(candidate: &Candidate, platform: i64, options: &ImportOptions) -> Result<GameInput> {
    let mut input = match &candidate.game {
        Some(game) => models::metadata(game, pc_platform(game), platform)?,
        None => GameInput {
            title: candidate.steam_name.chars().take(300).collect(),
            platform_id: platform,
            ..Default::default()
        },
    };
    input.media_type = "Digital".into();
    input.play_status = if options.backlog_unplayed && candidate.playtime_minutes == 0 {
        "Backlog"
    } else {
        "Not Started"
    }
    .into();
    input.account = options.account.clone();
    Ok(input)
}

/// Adds one game to the library. `cover` is the outcome of downloading its
/// cover, if one was tried: a failed download still adds the game.
fn save_candidate(
    connection: &Connection,
    root: &Path,
    existing: &mut Vec<Game>,
    candidate: &Candidate,
    platform: i64,
    options: &ImportOptions,
    cover: Option<Result<String>>,
) -> Outcome {
    let outcome = |status, message| Outcome {
        appid: candidate.appid,
        title: candidate.title().into(),
        status,
        message,
    };
    let igdb_id = candidate.game.as_ref().map(|g| g.id);
    if already_have(existing, platform, igdb_id, candidate.title()) {
        return outcome("skipped", Some("Already in your library.".into()));
    }
    let mut input = match build_input(candidate, platform, options) {
        Ok(input) => input,
        Err(error) => return outcome("failed", Some(error)),
    };
    let mut message = None;
    match cover {
        Some(Ok(path)) => input.cover_path = Some(path),
        Some(Err(_)) => message = Some("Added without a cover: it could not be downloaded.".into()),
        None => {}
    }
    let cover_path = input.cover_path.clone();
    match catalog::save_game(connection, None, input) {
        Ok(game) => {
            existing.push(game);
            outcome("added", message)
        }
        Err(error) => {
            if let Some(path) = cover_path {
                let _ = assets::remove_unused(connection, root, &path);
            }
            outcome("failed", Some(error))
        }
    }
}

// ---- commands ----

#[derive(Serialize)]
pub struct SteamConfig {
    configured: bool,
}
#[tauri::command]
pub fn steam_config(app: AppHandle) -> Result<SteamConfig> {
    Ok(SteamConfig {
        configured: creds::read(&service(&app))?.is_some(),
    })
}
#[tauri::command]
pub fn steam_save_credentials(
    app: AppHandle,
    state: State<'_, Steam>,
    api_key: String,
    profile: String,
) -> Result<()> {
    let credentials = Credentials::new(api_key, profile)?;
    creds::write(&service(&app), &credentials)?;
    state.candidates.lock().map_err(|e| e.to_string())?.clear();
    Ok(())
}
#[tauri::command]
pub fn steam_clear_credentials(app: AppHandle, state: State<'_, Steam>) -> Result<()> {
    state.candidates.lock().map_err(|e| e.to_string())?.clear();
    creds::clear(&service(&app))
}
/// Forgets the loaded library (called when the import screen closes).
#[tauri::command]
pub fn steam_clear_cache(state: State<'_, Steam>) -> Result<()> {
    state.candidates.lock().map_err(|e| e.to_string())?.clear();
    Ok(())
}

/// Reads the account's games with the saved key and profile.
async fn fetch_owned(app: &AppHandle) -> Result<(Vec<OwnedGame>, Option<String>)> {
    let credentials = creds::read(&service(app))?
        .ok_or("Add your Steam API key and profile in Settings first.")?;
    let client = SteamClient::new()?;
    let steam_id = client
        .steam_id(&credentials.api_key, &Profile::parse(&credentials.profile)?)
        .await?;
    let owned = client.owned_games(&credentials.api_key, steam_id).await?;
    let name = client.display_name(&credentials.api_key, steam_id).await;
    Ok((owned, name))
}

#[derive(Serialize)]
pub struct SteamTest {
    games: usize,
    account_name: Option<String>,
}
#[tauri::command]
pub async fn steam_test(app: AppHandle) -> Result<SteamTest> {
    let (owned, account_name) = fetch_owned(&app).await?;
    Ok(SteamTest {
        games: owned.len(),
        account_name,
    })
}

/// Loads the Steam library and matches it to IGDB. Nothing is saved yet.
#[tauri::command]
pub async fn steam_load(
    app: AppHandle,
    igdb: State<'_, Igdb>,
    state: State<'_, Steam>,
) -> Result<SteamLibrary> {
    let _run = state
        .running
        .try_lock()
        .map_err(|_| "A Steam import is already running.".to_string())?;
    let (owned, account_name) = fetch_owned(&app).await?;
    let appids: Vec<u64> = owned.iter().map(|g| g.appid).collect();
    let (matches, matching_available) = match igdb::steam_matches(&app, &igdb, &appids).await? {
        Some(matches) => (matches, true),
        None => (Vec::new(), false),
    };
    let connection = commands::connection(&app)?;
    let platform = steam_platform(&connection)?;
    let existing = catalog::list_games(&connection)?;
    let candidates = plan(owned, matches);
    let items = candidates
        .iter()
        .map(|c| item(c, &existing, platform))
        .collect();
    *state.candidates.lock().map_err(|e| e.to_string())? = candidates;
    Ok(SteamLibrary {
        account_name,
        matching_available,
        items,
    })
}

/// Adds the chosen games. Called repeatedly with small groups so the screen
/// can show progress and offer to stop.
#[tauri::command]
pub async fn steam_import(
    app: AppHandle,
    igdb: State<'_, Igdb>,
    state: State<'_, Steam>,
    appids: Vec<u64>,
    options: ImportOptions,
) -> Result<Vec<Outcome>> {
    let _run = state
        .running
        .try_lock()
        .map_err(|_| "A Steam import is already running.".to_string())?;
    if appids.len() > 100 {
        return Err("Import fewer games at a time.".into());
    }
    let candidates: Vec<Candidate> = {
        let all = state.candidates.lock().map_err(|e| e.to_string())?;
        if all.is_empty() {
            return Err("Your Steam library is no longer loaded. Load it again.".into());
        }
        appids
            .iter()
            .filter_map(|id| all.iter().find(|c| c.appid == *id).cloned())
            .collect()
    };
    let root = tauri::Manager::path(&app)
        .app_data_dir()
        .map_err(|_| "Application data unavailable.")?;
    let connection = commands::connection(&app)?;
    let platform = steam_platform(&connection)?;
    let mut existing = catalog::list_games(&connection)?;
    let mut outcomes = Vec::new();
    for candidate in &candidates {
        let igdb_id = candidate.game.as_ref().map(|g| g.id);
        // Skip before downloading anything for a game that is already here.
        let cover = if already_have(&existing, platform, igdb_id, candidate.title()) {
            None
        } else if let Some(cover) = candidate.game.as_ref().and_then(|g| g.cover.as_ref()) {
            Some(igdb::download_cover(&app, &igdb, &cover.image_id).await)
        } else {
            None
        };
        outcomes.push(save_candidate(
            &connection,
            &root,
            &mut existing,
            candidate,
            platform,
            &options,
            cover,
        ));
    }
    Ok(outcomes)
}
