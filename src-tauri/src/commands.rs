use crate::{
    assets,
    catalog::{self, Game, GameInput, Platform, Result},
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
    let old = catalog::delete_game(&c, id)?;
    if let Some(old) = old
        && let Err(e) = assets::remove_unused(&c, &root(&app)?, &old)
    {
        eprintln!("{e}");
    }
    Ok(())
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
