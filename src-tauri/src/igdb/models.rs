use crate::catalog::{GameInput, Platform, Result};
use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize)]
pub struct Named {
    pub id: i64,
    pub name: String,
    #[serde(default)]
    pub slug: String,
}
#[derive(Clone, Deserialize)]
pub struct Cover {
    pub image_id: String,
}
#[derive(Clone, Deserialize)]
pub struct Company {
    pub company: Named,
    #[serde(default)]
    pub developer: bool,
    #[serde(default)]
    pub publisher: bool,
}
#[derive(Clone, Deserialize)]
pub struct Release {
    pub platform: i64,
    pub date: Option<i64>,
}
#[derive(Clone, Deserialize)]
pub struct ApiGame {
    pub id: i64,
    pub name: String,
    pub first_release_date: Option<i64>,
    pub cover: Option<Cover>,
    #[serde(default)]
    pub platforms: Vec<Named>,
    #[serde(default)]
    pub genres: Vec<Named>,
    #[serde(default)]
    pub involved_companies: Vec<Company>,
    #[serde(default)]
    pub release_dates: Vec<Release>,
    pub version_parent: Option<i64>,
}
#[derive(Serialize)]
pub struct SearchPlatform {
    pub id: i64,
    pub name: String,
    pub local_id: Option<i64>,
}
#[derive(Serialize)]
pub struct SearchResult {
    pub igdb_id: i64,
    pub title: String,
    pub release_year: Option<String>,
    pub thumbnail: Option<String>,
    pub platforms: Vec<SearchPlatform>,
    pub version: bool,
}
#[derive(Serialize)]
pub struct Import {
    pub input: GameInput,
    pub warning: Option<String>,
}

pub fn date(timestamp: i64) -> Option<String> {
    let value = chrono::DateTime::from_timestamp(timestamp, 0)?;
    let year = value.format("%Y").to_string();
    (year.len() == 4 && !year.starts_with('-') && year != "0000")
        .then(|| value.format("%Y-%m-%d").to_string())
}
pub fn mapped_platform(remote: &Named, local: &[Platform]) -> Option<i64> {
    let seed_id = match remote.slug.as_str() {
        "nes" | "nintendo-entertainment-system-nes" => 1,
        "snes" => 2,
        "n64" | "nintendo-64" => 3,
        "ngc" => 4,
        "wii" => 5,
        "wiiu" => 6,
        "switch" => 7,
        "switch-2" => 8,
        "3ds" => 9,
        "ps" => 10,
        "ps2" => 11,
        "ps3" => 12,
        "ps4" => 13,
        "ps5" => 14,
        "xbox" => 15,
        "xbox360" => 16,
        "series-x-s" => 17,
        "win" => 19,
        "dc" => 20,
        _ => return None,
    };
    local
        .iter()
        .find(|p| p.id == seed_id && p.is_builtin)
        .map(|p| p.id)
}
fn joined(values: impl Iterator<Item = String>) -> Option<String> {
    let mut names: Vec<String> = values
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .collect();
    names.sort();
    names.dedup();
    let mut value = names.join(", ");
    while value.len() > 500 {
        value.pop();
    }
    (!value.is_empty()).then_some(value)
}
pub fn metadata(
    game: &ApiGame,
    remote_platform: Option<i64>,
    local_platform: i64,
) -> Result<GameInput> {
    if game.id <= 0 || game.name.trim().is_empty() || game.name.len() > 300 {
        return Err("IGDB returned an invalid game record.".into());
    }
    if !game.platforms.is_empty() && !game.platforms.iter().any(|p| Some(p.id) == remote_platform) {
        return Err("Choose an available IGDB platform.".into());
    }
    let release = game
        .release_dates
        .iter()
        .filter(|r| Some(r.platform) == remote_platform)
        .filter_map(|r| r.date.and_then(date))
        .min()
        .or_else(|| game.first_release_date.and_then(date));
    Ok(GameInput {
        igdb_id: Some(game.id),
        title: game.name.trim().into(),
        platform_id: local_platform,
        release_date: release,
        genre: joined(game.genres.iter().map(|g| g.name.clone())),
        developer: joined(
            game.involved_companies
                .iter()
                .filter(|c| c.developer)
                .map(|c| c.company.name.clone()),
        ),
        publisher: joined(
            game.involved_companies
                .iter()
                .filter(|c| c.publisher)
                .map(|c| c.company.name.clone()),
        ),
        media_type: "Physical".into(),
        play_status: "Not Started".into(),
        ..Default::default()
    })
}
pub fn image_url(id: &str, thumbnail: bool) -> Result<String> {
    if id.is_empty()
        || id.len() > 100
        || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
    {
        return Err("IGDB cover identifier is invalid.".into());
    }
    Ok(format!(
        "https://images.igdb.com/igdb/image/upload/{}/{}.jpg",
        if thumbnail {
            "t_cover_small"
        } else {
            "t_cover_big"
        },
        id
    ))
}
pub fn search_query(query: &str) -> Result<String> {
    let query = query.trim();
    if query.is_empty() || query.len() > 200 || query.chars().any(char::is_control) {
        return Err("Enter a search of 1 to 200 characters.".into());
    }
    let escaped = query.replace('\\', "\\\\").replace('"', "\\\"");
    Ok(format!(
        "search \"{escaped}\"; fields name,first_release_date,cover.image_id,platforms.name,platforms.slug,version_parent; limit 20;"
    ))
}
