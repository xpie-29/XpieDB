use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

pub type Result<T> = std::result::Result<T, String>;
fn db(error: rusqlite::Error) -> String {
    format!("The library could not be updated: {error}")
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct GameInput {
    pub title: String,
    pub platform_id: i64,
    pub release_date: Option<String>,
    pub genre: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub cover_path: Option<String>,
    pub media_type: String,
    pub play_status: String,
    pub rating: Option<i64>,
    pub notes_html: String,
    pub tags: Vec<String>,
}
#[derive(Debug, Serialize)]
pub struct Game {
    pub id: i64,
    pub igdb_id: Option<i64>,
    #[serde(flatten)]
    pub data: GameInput,
    pub date_added: String,
    pub date_modified: String,
}
#[derive(Debug, Deserialize, Serialize)]
pub struct Platform {
    pub id: i64,
    pub name: String,
    pub short_name: String,
    pub icon_path: Option<String>,
    pub sort_order: i64,
    pub is_builtin: bool,
}

pub fn sanitize_notes(html: &str) -> String {
    ammonia::Builder::default()
        .tags(
            [
                "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a",
            ]
            .into_iter()
            .collect(),
        )
        .generic_attributes(HashSet::new())
        .tag_attributes(HashMap::from([("a", HashSet::from(["href"]))]))
        .url_schemes(HashSet::from(["http", "https"]))
        .url_relative(ammonia::UrlRelative::Deny)
        .clean(html)
        .to_string()
}

fn clean_optional(value: &mut Option<String>) -> Result<()> {
    *value = value
        .take()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
    if value.as_ref().is_some_and(|v| v.len() > 500) {
        return Err("Metadata fields must be under 500 characters.".into());
    }
    Ok(())
}
fn validate(input: &mut GameInput) -> Result<()> {
    input.title = input.title.trim().into();
    if input.title.is_empty() || input.title.len() > 300 {
        return Err("Enter a title of 1 to 300 characters.".into());
    }
    if !["Physical", "Digital"].contains(&input.media_type.as_str()) {
        return Err("Choose a valid media type.".into());
    }
    if !["Not Started", "Playing", "Completed", "Paused", "Dropped"]
        .contains(&input.play_status.as_str())
    {
        return Err("Choose a valid play status.".into());
    }
    if input.rating.is_some_and(|r| !(1..=5).contains(&r)) {
        return Err("Rating must be between 1 and 5.".into());
    }
    for value in [
        &mut input.release_date,
        &mut input.genre,
        &mut input.developer,
        &mut input.publisher,
    ] {
        clean_optional(value)?;
    }
    if let Some(date) = &input.release_date {
        let parts: Vec<_> = date.split('-').collect();
        let valid = (|| {
            if parts.len() != 3 || parts[0].len() != 4 || parts[1].len() != 2 || parts[2].len() != 2
            {
                return None;
            }
            let y: u32 = parts[0].parse().ok()?;
            let m: u32 = parts[1].parse().ok()?;
            let d: u32 = parts[2].parse().ok()?;
            let max = match m {
                1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
                4 | 6 | 9 | 11 => 30,
                2 => {
                    if y.is_multiple_of(4) && (!y.is_multiple_of(100) || y.is_multiple_of(400)) {
                        29
                    } else {
                        28
                    }
                }
                _ => 0,
            };
            Some(y > 0 && d > 0 && d <= max)
        })()
        .unwrap_or(false);
        if !valid {
            return Err("Use a valid release date (YYYY-MM-DD).".into());
        }
    }
    if input.notes_html.len() > 100_000 {
        return Err("Notes are too long (maximum 100 KB).".into());
    }
    input.notes_html = sanitize_notes(&input.notes_html);
    if input.tags.len() > 30 || input.tags.iter().any(|t| t.trim().len() > 60) {
        return Err("Use at most 30 tags, each under 60 characters.".into());
    }
    Ok(())
}

pub fn get_game(c: &Connection, id: i64) -> Result<Game> {
    let mut game = c.query_row("SELECT id,igdb_id,title,platform_id,release_date,genre,developer,publisher,cover_path,media_type,play_status,rating,notes_html,date_added,date_modified FROM games WHERE id=?1", [id], |r| Ok(Game {
        id:r.get(0)?, igdb_id:r.get(1)?, data:GameInput { title:r.get(2)?, platform_id:r.get(3)?, release_date:r.get(4)?, genre:r.get(5)?, developer:r.get(6)?, publisher:r.get(7)?, cover_path:r.get(8)?, media_type:r.get(9)?, play_status:r.get(10)?, rating:r.get(11)?, notes_html:r.get(12)?, tags:vec![] }, date_added:r.get(13)?, date_modified:r.get(14)?
    })).optional().map_err(db)?.ok_or("This game no longer exists.")?;
    game.data.notes_html = sanitize_notes(&game.data.notes_html);
    let mut statement = c.prepare("SELECT t.name FROM tags t JOIN game_tags gt ON gt.tag_id=t.id WHERE gt.game_id=? ORDER BY t.name COLLATE NOCASE").map_err(db)?;
    game.data.tags = statement
        .query_map([id], |r| r.get(0))
        .map_err(db)?
        .collect::<std::result::Result<_, _>>()
        .map_err(db)?;
    Ok(game)
}
pub fn list_games(c: &Connection) -> Result<Vec<Game>> {
    let mut s = c
        .prepare("SELECT id FROM games ORDER BY title COLLATE NOCASE,id")
        .map_err(db)?;
    let ids = s
        .query_map([], |r| r.get(0))
        .map_err(db)?
        .collect::<std::result::Result<Vec<i64>, _>>()
        .map_err(db)?;
    ids.into_iter().map(|id| get_game(c, id)).collect()
}
pub fn save_game(c: &Connection, id: Option<i64>, mut input: GameInput) -> Result<Game> {
    validate(&mut input)?;
    let tx = c.unchecked_transaction().map_err(db)?;
    let platform_exists: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM platforms WHERE id=?)",
            [input.platform_id],
            |r| r.get(0),
        )
        .map_err(db)?;
    if !platform_exists {
        return Err("Choose an existing platform.".into());
    }
    let values = params![
        input.title,
        input.platform_id,
        input.release_date,
        input.genre,
        input.developer,
        input.publisher,
        input.cover_path,
        input.media_type,
        input.play_status,
        input.rating,
        input.notes_html
    ];
    let game_id = if let Some(id) = id {
        get_game(&tx, id)?;
        tx.execute("UPDATE games SET title=?1,platform_id=?2,release_date=?3,genre=?4,developer=?5,publisher=?6,cover_path=?7,media_type=?8,play_status=?9,rating=?10,notes_html=?11,date_modified=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?12", params![input.title,input.platform_id,input.release_date,input.genre,input.developer,input.publisher,input.cover_path,input.media_type,input.play_status,input.rating,input.notes_html,id]).map_err(db)?;
        id
    } else {
        tx.execute("INSERT INTO games(title,platform_id,release_date,genre,developer,publisher,cover_path,media_type,play_status,rating,notes_html) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)", values).map_err(db)?;
        tx.last_insert_rowid()
    };
    tx.execute("DELETE FROM game_tags WHERE game_id=?", [game_id])
        .map_err(db)?;
    for tag in input
        .tags
        .iter()
        .map(|t| t.trim())
        .filter(|t| !t.is_empty())
    {
        tx.execute("INSERT OR IGNORE INTO tags(name) VALUES (?)", [tag])
            .map_err(db)?;
        tx.execute("INSERT OR IGNORE INTO game_tags(game_id,tag_id) SELECT ?1,id FROM tags WHERE name=?2 COLLATE NOCASE", params![game_id,tag]).map_err(db)?;
    }
    tx.execute(
        "DELETE FROM tags WHERE NOT EXISTS(SELECT 1 FROM game_tags WHERE tag_id=tags.id)",
        [],
    )
    .map_err(db)?;
    tx.commit().map_err(db)?;
    get_game(c, game_id)
}
pub fn delete_game(c: &Connection, id: i64) -> Result<Option<String>> {
    let tx = c.unchecked_transaction().map_err(db)?;
    let old = get_game(&tx, id)?.data.cover_path;
    tx.execute("DELETE FROM games WHERE id=?", [id])
        .map_err(db)?;
    tx.execute(
        "DELETE FROM tags WHERE NOT EXISTS(SELECT 1 FROM game_tags WHERE tag_id=tags.id)",
        [],
    )
    .map_err(db)?;
    tx.commit().map_err(db)?;
    Ok(old)
}
pub fn list_platforms(c: &Connection) -> Result<Vec<Platform>> {
    c.prepare("SELECT id,name,short_name,icon_path,sort_order,is_builtin FROM platforms ORDER BY sort_order,name COLLATE NOCASE").map_err(db)?.query_map([], |r| Ok(Platform { id:r.get(0)?,name:r.get(1)?,short_name:r.get(2)?,icon_path:r.get(3)?,sort_order:r.get(4)?,is_builtin:r.get(5)? })).map_err(db)?.collect::<std::result::Result<_,_>>().map_err(db)
}
pub fn save_platform(
    c: &Connection,
    id: Option<i64>,
    name: &str,
    short_name: &str,
    icon: Option<String>,
) -> Result<()> {
    let name = name.trim();
    let short_name = short_name.trim();
    if name.is_empty()
        || name.len() > 100
        || short_name.is_empty()
        || short_name.chars().count() > 5
    {
        return Err("Enter a platform name and a short mark of 1 to 5 characters.".into());
    }
    if let Some(id) = id {
        if c.execute(
            "UPDATE platforms SET name=?1,short_name=?2,icon_path=?3 WHERE id=?4",
            params![name, short_name, icon, id],
        )
        .map_err(db)?
            == 0
        {
            return Err("Platform not found.".into());
        }
    } else {
        c.execute(
            "INSERT INTO platforms(name,short_name,icon_path) VALUES (?1,?2,?3)",
            params![name, short_name, icon],
        )
        .map_err(db)?;
    }
    Ok(())
}
pub fn delete_platform(c: &Connection, id: i64) -> Result<()> {
    let changed=c.execute("DELETE FROM platforms WHERE id=? AND is_builtin=0 AND NOT EXISTS(SELECT 1 FROM games WHERE platform_id=platforms.id)",[id]).map_err(db)?;
    if changed == 0 {
        return Err("Only unused custom platforms can be deleted.".into());
    }
    Ok(())
}
pub fn preferences(c: &Connection) -> Result<HashMap<String, String>> {
    c.prepare("SELECT key,value FROM preferences")
        .map_err(db)?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(db)?
        .collect::<std::result::Result<_, _>>()
        .map_err(db)
}
pub fn set_preference(c: &Connection, key: &str, value: &str) -> Result<()> {
    let valid = match key {
        "library_view" => ["grid", "list"].contains(&value),
        "cover_size" => ["small", "medium", "large", "extra_large"].contains(&value),
        _ => false,
    };
    if !valid {
        return Err("Unknown view preference.".into());
    }
    c.execute(
        "UPDATE preferences SET value=?1 WHERE key=?2",
        params![value, key],
    )
    .map_err(db)?;
    Ok(())
}
