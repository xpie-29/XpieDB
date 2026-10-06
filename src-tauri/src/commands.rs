use crate::{
    assets,
    catalog::{self, Game, GameInput, Platform, Result},
    guide_files::{self, Bookmark, GuideFile},
    guides::{self, Guide, GuideInput},
    hardware::{self, Hardware, HardwareInput},
};
use std::collections::HashMap;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

fn root(app: &AppHandle) -> Result<std::path::PathBuf> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}
pub(crate) fn connection(app: &AppHandle) -> Result<rusqlite::Connection> {
    let c = rusqlite::Connection::open(root(app)?.join("xpiedb.db")).map_err(|e| e.to_string())?;
    c.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    c.execute_batch("PRAGMA foreign_keys=ON;")
        .map_err(|e| e.to_string())?;
    Ok(c)
}
#[tauri::command]
pub fn list_games(app: AppHandle) -> Result<Vec<Game>> {
    catalog::list_games(&connection(&app)?)
}
#[tauri::command]
pub fn get_game(app: AppHandle, id: i64) -> Result<Game> {
    catalog::get_game(&connection(&app)?, id)
}
#[tauri::command]
pub fn save_game(app: AppHandle, id: Option<i64>, input: GameInput) -> Result<Game> {
    let root = root(&app)?;
    let c = connection(&app)?;
    assets::validate_reference(&root, input.cover_path.as_deref(), "covers")?;
    let old = id
        .map(|id| catalog::get_game(&c, id))
        .transpose()?
        .and_then(|g| g.data.cover_path);
    let game = catalog::save_game(&c, id, input)?;
    if let Some(old) = old
        && game.data.cover_path.as_ref() != Some(&old)
        && let Err(e) = assets::remove_unused(&c, &root, &old)
    {
        eprintln!("{e}");
    }
    Ok(game)
}
#[tauri::command]
pub fn delete_game(app: AppHandle, id: i64) -> Result<()> {
    let c = connection(&app)?;
    let panel_image = catalog::get_game(&c, id)?.panel.image;
    let old = catalog::delete_game(&c, id)?;
    for path in old.into_iter().chain(panel_image) {
        if let Err(e) = assets::remove_unused(&c, &root(&app)?, &path) {
            eprintln!("{e}");
        }
    }
    Ok(())
}
#[tauri::command]
pub fn set_game_panel(app: AppHandle, id: i64, panel: catalog::Panel) -> Result<Game> {
    let root = root(&app)?;
    let c = connection(&app)?;
    assets::validate_reference(&root, panel.image.as_deref(), "covers")?;
    let old = catalog::get_game(&c, id)?.panel.image;
    let game = catalog::set_game_panel(&c, id, &panel)?;
    if let Some(old) = old
        && game.panel.image.as_ref() != Some(&old)
        && let Err(e) = assets::remove_unused(&c, &root, &old)
    {
        eprintln!("{e}");
    }
    Ok(game)
}
/// The operating system's accent colour as "#rrggbb", or None where the OS does not offer one.
#[tauri::command]
pub fn system_accent() -> Option<String> {
    crate::system_accent::read()
}
#[tauri::command]
pub fn set_game_hidden(app: AppHandle, id: i64, hidden: bool) -> Result<Game> {
    catalog::set_game_hidden(&connection(&app)?, id, hidden)
}
#[tauri::command]
pub fn backlog_set_order(app: AppHandle, ids: Vec<i64>) -> Result<()> {
    catalog::set_backlog_order(&connection(&app)?, &ids)
}
#[tauri::command]
pub fn backlog_add(app: AppHandle, ids: Vec<i64>) -> Result<usize> {
    catalog::add_to_backlog(&connection(&app)?, &ids)
}
#[tauri::command]
pub fn backlog_remove(app: AppHandle, id: i64, status: String) -> Result<()> {
    catalog::remove_from_backlog(&connection(&app)?, id, &status)
}
#[tauri::command]
pub fn list_hardware(app: AppHandle) -> Result<Vec<Hardware>> {
    hardware::list_hardware(&connection(&app)?)
}
#[tauri::command]
pub fn save_hardware(
    app: AppHandle,
    id: Option<i64>,
    input: HardwareInput,
    with_accessories: Option<Vec<i64>>,
) -> Result<Hardware> {
    let root = root(&app)?;
    let c = connection(&app)?;
    assets::validate_reference(&root, input.photo_path.as_deref(), "covers")?;
    let old = id
        .map(|id| hardware::get_hardware(&c, id))
        .transpose()?
        .and_then(|h| h.data.photo_path);
    let item = hardware::save_hardware(&c, id, input, &with_accessories.unwrap_or_default())?;
    if let Some(old) = old
        && item.data.photo_path.as_ref() != Some(&old)
        && let Err(e) = assets::remove_unused(&c, &root, &old)
    {
        eprintln!("{e}");
    }
    Ok(item)
}
#[tauri::command]
pub fn delete_hardware(app: AppHandle, id: i64) -> Result<()> {
    let c = connection(&app)?;
    if let Some(old) = hardware::delete_hardware(&c, id)?
        && let Err(e) = assets::remove_unused(&c, &root(&app)?, &old)
    {
        eprintln!("{e}");
    }
    Ok(())
}
#[tauri::command]
pub fn list_guides(app: AppHandle) -> Result<Vec<Guide>> {
    let c = connection(&app)?;
    let mut list = guides::list_guides(&c)?;
    guides::with_files(&c, &root(&app)?, &mut list)?;
    Ok(list)
}
#[tauri::command]
pub fn save_guide(app: AppHandle, id: Option<i64>, input: GuideInput) -> Result<Guide> {
    let root = root(&app)?;
    let c = connection(&app)?;
    assets::validate_reference(&root, input.photo_path.as_deref(), "covers")?;
    let old = id
        .map(|id| guides::get_guide(&c, id))
        .transpose()?
        .and_then(|g| g.data.photo_path);
    let mut guide = guides::save_guide(&c, id, input)?;
    guides::with_files(&c, &root, std::slice::from_mut(&mut guide))?;
    if let Some(old) = old
        && guide.data.photo_path.as_ref() != Some(&old)
        && let Err(e) = assets::remove_unused(&c, &root, &old)
    {
        eprintln!("{e}");
    }
    Ok(guide)
}
#[tauri::command]
pub fn delete_guide(app: AppHandle, id: i64) -> Result<()> {
    let c = connection(&app)?;
    let root = root(&app)?;
    if let Some(old) = guides::delete_guide_with_files(&c, &root, id)?
        && let Err(e) = assets::remove_unused(&c, &root, &old)
    {
        eprintln!("{e}");
    }
    Ok(())
}
/// Lets the owner pick a PDF or ePub and copies it into the app's folder as a digital copy of the guide.
#[tauri::command]
pub async fn attach_guide_file(app: AppHandle, guide_id: i64) -> Result<Option<GuideFile>> {
    let source = app
        .dialog()
        .file()
        .add_filter("Guides (PDF or ePub)", &["pdf", "epub"])
        .blocking_pick_file();
    let Some(source) = source else {
        return Ok(None);
    };
    let path = source.into_path().map_err(|e| e.to_string())?;
    let root = root(&app)?;
    let c = connection(&app)?;
    guide_files::attach(&c, &root, guide_id, &path, None, guide_files::MAX_BYTES).map(Some)
}
#[tauri::command]
pub fn remove_guide_file(app: AppHandle, id: i64) -> Result<()> {
    guide_files::remove(&connection(&app)?, &root(&app)?, id)
}
/// Opens a guide file in the default app for its type (by id only).
#[tauri::command]
pub fn open_guide_file(app: AppHandle, id: i64) -> Result<()> {
    let path = guide_files::path_of(&connection(&app)?, &root(&app)?, id)?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}
/// Shows a guide file in Finder (or the system file manager).
#[tauri::command]
pub fn reveal_guide_file(app: AppHandle, id: i64) -> Result<()> {
    let path = guide_files::path_of(&connection(&app)?, &root(&app)?, id)?;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn list_platforms(app: AppHandle) -> Result<Vec<Platform>> {
    catalog::list_platforms(&connection(&app)?)
}
#[tauri::command]
pub fn save_platform(
    app: AppHandle,
    id: Option<i64>,
    name: String,
    short_name: String,
    icon_path: Option<String>,
) -> Result<()> {
    let root = root(&app)?;
    assets::validate_reference(&root, icon_path.as_deref(), "platform-icons")?;
    let c = connection(&app)?;
    let old = catalog::list_platforms(&c)?
        .into_iter()
        .find(|p| Some(p.id) == id)
        .and_then(|p| p.icon_path);
    catalog::save_platform(&c, id, &name, &short_name, icon_path)?;
    if let Some(old) = old
        && let Err(e) = assets::remove_unused(&c, &root, &old)
    {
        eprintln!("{e}");
    }
    Ok(())
}
#[tauri::command]
pub fn delete_platform(app: AppHandle, id: i64) -> Result<()> {
    let c = connection(&app)?;
    let old = catalog::list_platforms(&c)?
        .into_iter()
        .find(|p| p.id == id)
        .and_then(|p| p.icon_path);
    catalog::delete_platform(&c, id)?;
    if let Some(old) = old
        && let Err(e) = assets::remove_unused(&c, &root(&app)?, &old)
    {
        eprintln!("{e}");
    }
    Ok(())
}
#[tauri::command]
pub fn get_preferences(app: AppHandle) -> Result<HashMap<String, String>> {
    catalog::preferences(&connection(&app)?)
}
#[tauri::command]
pub fn set_preference(app: AppHandle, key: String, value: String) -> Result<()> {
    catalog::set_preference(&connection(&app)?, &key, &value)
}
#[tauri::command]
pub async fn select_image(app: AppHandle, kind: String) -> Result<Option<String>> {
    let source = app
        .dialog()
        .file()
        .add_filter("Images", &["png", "jpg", "jpeg", "webp"])
        .blocking_pick_file();
    source
        .map(|p| {
            p.into_path()
                .map_err(|e| e.to_string())
                .and_then(|p| assets::import(&root(&app)?, &p, &kind))
        })
        .transpose()
}
#[tauri::command]
pub fn image_data(app: AppHandle, path: String) -> Result<String> {
    assets::data_url(&root(&app)?, &path)
}
#[tauri::command]
pub fn discard_image(app: AppHandle, path: String) -> Result<()> {
    assets::remove_unused(&connection(&app)?, &root(&app)?, &path)
}
pub fn validate_url(value: &str) -> Result<String> {
    let url =
        ammonia::Url::parse(value).map_err(|_| "Enter a valid HTTP or HTTPS link.".to_string())?;
    if !["https", "http"].contains(&url.scheme())
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Only HTTP and HTTPS links without credentials can be opened.".into());
    }
    Ok(url.to_string())
}
#[tauri::command]
pub fn open_link(app: AppHandle, url: String) -> Result<()> {
    app.opener()
        .open_url(validate_url(&url)?, None::<&str>)
        .map_err(|e| e.to_string())
}
/// Remembers where the reader stopped in a file.
#[tauri::command]
pub fn set_guide_file_position(app: AppHandle, id: i64, page: i64) -> Result<()> {
    guide_files::record_position(&connection(&app)?, id, page)
}
#[tauri::command]
pub fn list_guide_bookmarks(app: AppHandle, file_id: i64) -> Result<Vec<Bookmark>> {
    guide_files::list_bookmarks(&connection(&app)?, file_id)
}
#[tauri::command]
pub fn add_guide_bookmark(
    app: AppHandle,
    file_id: i64,
    page: i64,
    label: Option<String>,
) -> Result<Bookmark> {
    guide_files::add_bookmark(&connection(&app)?, file_id, page, label.as_deref())
}
#[tauri::command]
pub fn rename_guide_bookmark(app: AppHandle, id: i64, label: String) -> Result<()> {
    guide_files::rename_bookmark(&connection(&app)?, id, &label)
}
#[tauri::command]
pub fn delete_guide_bookmark(app: AppHandle, id: i64) -> Result<()> {
    guide_files::delete_bookmark(&connection(&app)?, id)
}
