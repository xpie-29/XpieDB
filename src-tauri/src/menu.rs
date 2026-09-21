//! Application menu: Tauri's default menu with a Help menu that leads to the
//! About dialog (drawn by the frontend) and the project's GitHub page.
use serde::Serialize;
use tauri::{
    AppHandle, Emitter, Runtime,
    menu::{HELP_SUBMENU_ID, Menu, MenuEvent, MenuItem, MenuItemKind},
};
use tauri_plugin_opener::OpenerExt;

const ABOUT_ID: &str = "about";
const GITHUB_ID: &str = "github";
/// Frontend event that opens the About dialog.
const ABOUT_EVENT: &str = "open-about";
/// The repository still carries its original name, GameVault.
pub const REPOSITORY_URL: &str = "https://github.com/xpie-29/GameVault";

#[derive(Serialize)]
pub struct AboutInfo {
    name: &'static str,
    version: &'static str,
    repository: &'static str,
}

#[tauri::command]
pub fn about_info() -> AboutInfo {
    AboutInfo {
        name: "XpieDB",
        version: env!("CARGO_PKG_VERSION"),
        repository: REPOSITORY_URL,
    }
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    let about = MenuItem::with_id(app, ABOUT_ID, "About XpieDB", true, None::<&str>)?;
    let github = MenuItem::with_id(app, GITHUB_ID, "XpieDB on GitHub", true, None::<&str>)?;

    for item in menu.items()? {
        let MenuItemKind::Submenu(submenu) = item else {
            continue;
        };
        if submenu.id() == HELP_SUBMENU_ID {
            // Windows and Linux ship a stock About item here; ours replaces it.
            #[cfg(not(target_os = "macos"))]
            while submenu.remove_at(0)?.is_some() {}
            submenu.append(&about)?;
            submenu.append(&github)?;
        }
    }
    // macOS keeps About in the application menu: point it at the same dialog.
    #[cfg(target_os = "macos")]
    if let Some(MenuItemKind::Submenu(application)) = menu.items()?.into_iter().next() {
        application.remove_at(0)?;
        application.insert(
            &MenuItem::with_id(app, ABOUT_ID, "About XpieDB", true, None::<&str>)?,
            0,
        )?;
    }
    Ok(menu)
}

pub fn on_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    match event.id().as_ref() {
        ABOUT_ID => {
            let _ = app.emit(ABOUT_EVENT, ());
        }
        GITHUB_ID => {
            let _ = app.opener().open_url(REPOSITORY_URL, None::<&str>);
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_repository_link_passes_the_same_check_as_every_other_external_link() {
        let checked = crate::commands::validate_url(REPOSITORY_URL).unwrap();
        assert_eq!(checked, REPOSITORY_URL);
        assert!(REPOSITORY_URL.starts_with("https://github.com/"));
    }

    #[test]
    fn about_info_names_the_app_and_its_version() {
        let info = about_info();
        assert_eq!(info.name, "XpieDB");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
        assert_eq!(info.repository, REPOSITORY_URL);
        let json = serde_json::to_value(info).unwrap();
        assert_eq!(json["repository"], REPOSITORY_URL);
    }
}
