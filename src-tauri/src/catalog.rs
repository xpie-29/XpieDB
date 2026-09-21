use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

pub type Result<T> = std::result::Result<T, String>;

/// Every valid play status. Backlog is special: it is an ordered list.
pub const STATUSES: [&str; 6] = [
    "Not Started",
    "Backlog",
    "Playing",
    "Completed",
    "Paused",
    "Dropped",
];
pub const BACKLOG: &str = "Backlog";
fn db(error: rusqlite::Error) -> String {
    format!("The library could not be updated: {error}")
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct GameInput {
    pub igdb_id: Option<i64>,
    pub title: String,
    pub platform_id: i64,
    pub account: Option<String>,
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
    #[serde(flatten)]
    pub data: GameInput,
    pub date_added: String,
    pub date_modified: String,
    /// Place in the manual backlog order (1 = first); set exactly when the
    /// play status is Backlog.
    pub backlog_position: Option<i64>,
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
    if input.igdb_id.is_some_and(|id| id <= 0) {
        return Err("Invalid IGDB identifier.".into());
    }
    input.title = input.title.trim().into();
    if input.title.is_empty() || input.title.len() > 300 {
        return Err("Enter a title of 1 to 300 characters.".into());
    }
    if !["Physical", "Digital"].contains(&input.media_type.as_str()) {
        return Err("Choose a valid media type.".into());
    }
    if !STATUSES.contains(&input.play_status.as_str()) {
        return Err("Choose a valid play status.".into());
    }
    if input.rating.is_some_and(|r| !(1..=5).contains(&r)) {
        return Err("Rating must be between 1 and 5.".into());
    }
    for value in [
        &mut input.account,
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
    let mut game = c.query_row("SELECT id,igdb_id,title,platform_id,release_date,genre,developer,publisher,cover_path,media_type,play_status,rating,notes_html,date_added,date_modified,account,backlog_position FROM games WHERE id=?1", [id], |r| Ok(Game {
        id:r.get(0)?, data:GameInput { igdb_id:r.get(1)?, title:r.get(2)?, platform_id:r.get(3)?, account:r.get(15)?, release_date:r.get(4)?, genre:r.get(5)?, developer:r.get(6)?, publisher:r.get(7)?, cover_path:r.get(8)?, media_type:r.get(9)?, play_status:r.get(10)?, rating:r.get(11)?, notes_html:r.get(12)?, tags:vec![] }, date_added:r.get(13)?, date_modified:r.get(14)?, backlog_position:r.get(16)?
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
        input.notes_html,
        input.account,
        input.igdb_id
    ];
    let game_id = if let Some(id) = id {
        get_game(&tx, id)?;
        tx.execute("UPDATE games SET title=?1,platform_id=?2,release_date=?3,genre=?4,developer=?5,publisher=?6,cover_path=?7,media_type=?8,play_status=?9,rating=?10,notes_html=?11,account=?12,date_modified=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?13", params![input.title,input.platform_id,input.release_date,input.genre,input.developer,input.publisher,input.cover_path,input.media_type,input.play_status,input.rating,input.notes_html,input.account,id]).map_err(db)?;
        id
    } else {
        tx.execute("INSERT INTO games(title,platform_id,release_date,genre,developer,publisher,cover_path,media_type,play_status,rating,notes_html,account,igdb_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)", values).map_err(db)?;
        tx.last_insert_rowid()
    };
    sync_backlog(&tx, game_id, &input.play_status).map_err(db)?;
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
    renumber_backlog(&tx).map_err(db)?;
    tx.execute(
        "DELETE FROM tags WHERE NOT EXISTS(SELECT 1 FROM game_tags WHERE tag_id=tags.id)",
        [],
    )
    .map_err(db)?;
    tx.commit().map_err(db)?;
    Ok(old)
}
// The backlog is the games with status Backlog, in a manual order stored as
// `backlog_position`. Invariant: a game has a position exactly when its status
// is Backlog, and positions are 1..N without gaps. Every write below keeps it.
fn backlog_ids(c: &Connection) -> rusqlite::Result<Vec<i64>> {
    c.prepare(
        "SELECT id FROM games WHERE backlog_position IS NOT NULL ORDER BY backlog_position,id",
    )?
    .query_map([], |r| r.get(0))?
    .collect()
}
fn write_backlog(c: &Connection, ids: &[i64]) -> rusqlite::Result<()> {
    for (index, id) in ids.iter().enumerate() {
        c.execute(
            "UPDATE games SET backlog_position=?1 WHERE id=?2",
            params![index as i64 + 1, id],
        )?;
    }
    Ok(())
}
/// Closes gaps after a game leaves the backlog or is deleted.
fn renumber_backlog(c: &Connection) -> rusqlite::Result<()> {
    write_backlog(c, &backlog_ids(c)?)
}
/// After a save: a Backlog game without a place goes to the bottom, and a game
/// that is no longer Backlog gives up its place.
fn sync_backlog(c: &Connection, id: i64, status: &str) -> rusqlite::Result<()> {
    let position: Option<i64> =
        c.query_row("SELECT backlog_position FROM games WHERE id=?", [id], |r| {
            r.get(0)
        })?;
    if status == BACKLOG && position.is_none() {
        c.execute(
            "UPDATE games SET backlog_position=(SELECT COALESCE(MAX(backlog_position),0)+1 FROM games) WHERE id=?",
            [id],
        )?;
    } else if status != BACKLOG && position.is_some() {
        c.execute("UPDATE games SET backlog_position=NULL WHERE id=?", [id])?;
        renumber_backlog(c)?;
    }
    Ok(())
}
/// Repairs the invariant for databases that did not maintain it (older
/// versions, edited or restored files). Existing order is kept where it is valid.
pub fn normalize_backlog(c: &Connection) -> rusqlite::Result<()> {
    let tx = c.unchecked_transaction()?;
    tx.execute(
        "UPDATE games SET backlog_position=NULL WHERE play_status<>?1 AND backlog_position IS NOT NULL",
        [BACKLOG],
    )?;
    let ids: Vec<i64> = tx
        .prepare(
            "SELECT id FROM games WHERE play_status=?1 ORDER BY backlog_position IS NULL,backlog_position,id",
        )?
        .query_map([BACKLOG], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    write_backlog(&tx, &ids)?;
    tx.commit()
}
/// Sets the order. `ids` must be exactly the games now in the backlog, so a
/// stale screen cannot silently drop or duplicate entries.
pub fn set_backlog_order(c: &Connection, ids: &[i64]) -> Result<()> {
    let tx = c.unchecked_transaction().map_err(db)?;
    let mut current = backlog_ids(&tx).map_err(db)?;
    let mut requested = ids.to_vec();
    current.sort_unstable();
    requested.sort_unstable();
    if current != requested {
        return Err("The backlog has changed. Reopen it and try again.".into());
    }
    write_backlog(&tx, ids).map_err(db)?;
    tx.commit().map_err(db)
}
/// Puts games at the bottom of the backlog in the order given, setting their
/// status to Backlog. Games already in the backlog keep their place.
pub fn add_to_backlog(c: &Connection, ids: &[i64]) -> Result<usize> {
    if ids.len() > 10_000 {
        return Err("Choose fewer games at once.".into());
    }
    let tx = c.unchecked_transaction().map_err(db)?;
    let mut added = 0;
    for id in ids {
        if get_game(&tx, *id)?.backlog_position.is_some() {
            continue;
        }
        tx.execute(
            "UPDATE games SET play_status=?1,date_modified=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2",
            params![BACKLOG, id],
        )
        .map_err(db)?;
        sync_backlog(&tx, *id, BACKLOG).map_err(db)?;
        added += 1;
    }
    tx.commit().map_err(db)?;
    Ok(added)
}
/// Takes a game out of the backlog by giving it another status.
pub fn remove_from_backlog(c: &Connection, id: i64, status: &str) -> Result<()> {
    if status == BACKLOG || !STATUSES.contains(&status) {
        return Err("Choose a valid play status.".into());
    }
    let tx = c.unchecked_transaction().map_err(db)?;
    if get_game(&tx, id)?.backlog_position.is_none() {
        return Err("This game is not in the backlog.".into());
    }
    tx.execute(
        "UPDATE games SET play_status=?1,date_modified=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2",
        params![status, id],
    )
    .map_err(db)?;
    sync_backlog(&tx, id, status).map_err(db)?;
    tx.commit().map_err(db)
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
    let mut values: HashMap<String, String> = c
        .prepare("SELECT key,value FROM preferences")
        .map_err(db)?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(db)?
        .collect::<std::result::Result<_, _>>()
        .map_err(db)?;
    values
        .entry("library_sort".into())
        .or_insert_with(|| "title_asc".into());
    Ok(values)
}
pub fn set_preference(c: &Connection, key: &str, value: &str) -> Result<()> {
    let valid = match key {
        "library_view" => ["grid", "list"].contains(&value),
        "cover_size" => ["small", "medium", "large", "extra_large"].contains(&value),
        "stats_open" => ["true", "false"].contains(&value),
        "report_paper" => ["letter", "a4"].contains(&value),
        "report_orientation" => ["portrait", "landscape"].contains(&value),
        "library_sort" => [
            "title_asc",
            "title_desc",
            "release_desc",
            "release_asc",
            "rating_desc",
            "rating_asc",
            "added_desc",
            "added_asc",
            "platform_asc",
        ]
        .contains(&value),
        _ => false,
    };
    if !valid {
        return Err("Unknown view preference.".into());
    }
    c.execute(
        "INSERT INTO preferences(value,key) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![value, key],
    )
    .map_err(db)?;
    Ok(())
}
