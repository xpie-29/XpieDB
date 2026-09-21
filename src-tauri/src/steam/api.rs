//! Steam Web API client. Read-only: it lists the games an account owns.
//!
//! The API key travels in the URL (Steam's design), so URLs are never logged or
//! included in errors, and every failure is reported in generic terms.
use crate::catalog::Result;
use ammonia::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

/// A Steam Web API key is 32 hexadecimal characters.
const KEY_LEN: usize = 32;
const MAX_RESPONSE: usize = 16 * 1024 * 1024;
const PRIVATE_HELP: &str = "Steam did not return any games. In Steam, open your profile, choose Edit Profile > Privacy Settings, and set Game details to Public (you can turn it back afterwards). Then try again.";

/// Who to load the library of.
#[derive(Debug, PartialEq, Eq)]
pub enum Profile {
    /// A 17-digit SteamID64.
    Id(u64),
    /// A custom profile name (steamcommunity.com/id/<name>).
    Vanity(String),
}

const PROFILE_HELP: &str =
    "Enter your 17-digit Steam ID, your profile link, or your custom profile name.";

impl Profile {
    /// Accepts a SteamID64, a steamcommunity.com profile link (`/profiles/<id>` or
    /// `/id/<name>`), or a bare custom profile name.
    pub fn parse(input: &str) -> Result<Self> {
        let input = input.trim();
        if input.is_empty() || input.len() > 200 || input.chars().any(char::is_control) {
            return Err(PROFILE_HELP.into());
        }
        if let Some(id) = steam_id(input) {
            return Ok(Self::Id(id));
        }
        if input.contains("://") || input.contains('/') || input.contains('.') {
            let url = Url::parse(input)
                .or_else(|_| Url::parse(&format!("https://{input}")))
                .map_err(|_| PROFILE_HELP.to_string())?;
            let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
            if !["http", "https"].contains(&url.scheme())
                || !(host == "steamcommunity.com" || host == "www.steamcommunity.com")
                || !url.username().is_empty()
            {
                return Err("That is not a steamcommunity.com profile link.".into());
            }
            let parts: Vec<_> = url
                .path_segments()
                .map(|s| s.filter(|p| !p.is_empty()).collect())
                .unwrap_or_default();
            return match parts.as_slice() {
                ["profiles", id, ..] => steam_id(id)
                    .map(Self::Id)
                    .ok_or_else(|| PROFILE_HELP.into()),
                ["id", name, ..] if vanity_ok(name) => Ok(Self::Vanity((*name).into())),
                _ => Err(PROFILE_HELP.into()),
            };
        }
        if vanity_ok(input) {
            return Ok(Self::Vanity(input.into()));
        }
        Err(PROFILE_HELP.into())
    }
}
fn steam_id(text: &str) -> Option<u64> {
    (text.len() == 17 && text.starts_with("7656") && text.bytes().all(|b| b.is_ascii_digit()))
        .then(|| text.parse().ok())
        .flatten()
}
fn vanity_ok(name: &str) -> bool {
    (2..=32).contains(&name.len())
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// What is kept in the OS credential store. Never sent to the frontend.
#[derive(Serialize, Deserialize)]
pub struct Credentials {
    pub api_key: String,
    pub profile: String,
}
impl Credentials {
    pub fn new(api_key: String, profile: String) -> Result<Self> {
        let api_key = api_key.trim().to_string();
        let profile = profile.trim().to_string();
        if api_key.len() != KEY_LEN || !api_key.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("A Steam API key is 32 letters and numbers (0-9, a-f). Copy it from steamcommunity.com/dev/apikey.".into());
        }
        Profile::parse(&profile)?;
        Ok(Self { api_key, profile })
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct OwnedGame {
    pub appid: u64,
    pub name: String,
    pub playtime_minutes: u64,
}

fn clean_name(name: &str, max: usize) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max)
        .collect()
}

/// Reads a `GetOwnedGames` response. Steam answers an account whose game
/// details are private with an empty `response`, which is reported as such.
pub fn parse_owned(json: &Value) -> Result<Vec<OwnedGame>> {
    let response = json
        .get("response")
        .and_then(Value::as_object)
        .ok_or("Steam returned an unexpected response.")?;
    let Some(games) = response.get("games").and_then(Value::as_array) else {
        return if response.get("game_count").and_then(Value::as_u64) == Some(0) {
            Ok(Vec::new())
        } else {
            Err(PRIVATE_HELP.into())
        };
    };
    let mut seen = std::collections::HashSet::new();
    let mut owned = Vec::new();
    for game in games {
        let Some(appid) = game.get("appid").and_then(Value::as_u64) else {
            continue;
        };
        let name = clean_name(game.get("name").and_then(Value::as_str).unwrap_or(""), 300);
        if name.is_empty() || !seen.insert(appid) {
            continue;
        }
        owned.push(OwnedGame {
            appid,
            name,
            playtime_minutes: game
                .get("playtime_forever")
                .and_then(Value::as_u64)
                .unwrap_or(0),
        });
    }
    Ok(owned)
}

fn status_error(status: u16) -> String {
    match status {
        401 | 403 => "Steam rejected the API key. Check it in Settings.",
        429 => "Steam is rate-limiting requests. Wait a few minutes and try again.",
        500..=599 => "Steam is temporarily unavailable. Try again later.",
        _ => "Steam returned an unexpected response.",
    }
    .into()
}

pub struct SteamClient {
    http: reqwest::Client,
    base: String,
}
impl SteamClient {
    pub fn new() -> Result<Self> {
        Ok(Self {
            http: reqwest::Client::builder()
                .https_only(true)
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(30))
                .connect_timeout(Duration::from_secs(8))
                .user_agent("XpieDB/0.1.0")
                .build()
                .map_err(|_| "Could not initialize the secure HTTP client.")?,
            base: "https://api.steampowered.com".into(),
        })
    }
    /// Points the client at a local test server.
    #[cfg(test)]
    pub fn for_test(base: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            base,
        }
    }
    async fn get(&self, path: &str, params: &[(&str, &str)]) -> Result<Value> {
        let url = Url::parse_with_params(&format!("{}/{path}", self.base), params)
            .map_err(|_| "Could not build the Steam request.")?;
        let mut response = self.http.get(url).send().await.map_err(|_| {
            eprintln!("Steam network request failed");
            "Unable to reach Steam. Check your connection and try again.".to_string()
        })?;
        let status = response.status();
        if !status.is_success() {
            eprintln!("Steam request failed with HTTP {}", status.as_u16());
            return Err(status_error(status.as_u16()));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "Unable to reach Steam.".to_string())?
        {
            if bytes.len() + chunk.len() > MAX_RESPONSE {
                return Err("Steam's response was larger than expected.".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(|_| {
            eprintln!("Steam response parsing failed");
            "Steam returned an unexpected response.".into()
        })
    }
    /// Turns a custom profile name into a SteamID64.
    pub async fn resolve_vanity(&self, key: &str, name: &str) -> Result<u64> {
        let json = self
            .get(
                "ISteamUser/ResolveVanityURL/v1/",
                &[("key", key), ("vanityurl", name), ("format", "json")],
            )
            .await?;
        let response = json.get("response");
        match response
            .and_then(|r| r.get("success"))
            .and_then(Value::as_u64)
        {
            Some(1) => response
                .and_then(|r| r.get("steamid"))
                .and_then(Value::as_str)
                .and_then(steam_id)
                .ok_or_else(|| "Steam returned an unexpected response.".into()),
            Some(42) => Err("Steam has no profile with that custom name.".into()),
            _ => Err("Steam returned an unexpected response.".into()),
        }
    }
    pub async fn owned_games(&self, key: &str, steam_id: u64) -> Result<Vec<OwnedGame>> {
        let id = steam_id.to_string();
        let json = self
            .get(
                "IPlayerService/GetOwnedGames/v1/",
                &[
                    ("key", key),
                    ("steamid", &id),
                    ("include_appinfo", "1"),
                    ("include_played_free_games", "1"),
                    ("format", "json"),
                ],
            )
            .await?;
        parse_owned(&json)
    }
    /// The account's display name, to confirm whose library is being read.
    /// Best effort: any failure just means no name is shown.
    pub async fn display_name(&self, key: &str, steam_id: u64) -> Option<String> {
        let id = steam_id.to_string();
        let json = self
            .get(
                "ISteamUser/GetPlayerSummaries/v2/",
                &[("key", key), ("steamids", &id), ("format", "json")],
            )
            .await
            .ok()?;
        let name = json
            .get("response")?
            .get("players")?
            .get(0)?
            .get("personaname")?
            .as_str()?;
        let name = clean_name(name, 100);
        (!name.is_empty()).then_some(name)
    }
    /// The SteamID64 for a profile input, resolving a custom name if needed.
    pub async fn steam_id(&self, key: &str, profile: &Profile) -> Result<u64> {
        match profile {
            Profile::Id(id) => Ok(*id),
            Profile::Vanity(name) => self.resolve_vanity(key, name).await,
        }
    }
}
