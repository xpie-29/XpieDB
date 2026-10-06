mod archive;
mod assets;
mod backup;
mod catalog;
mod commands;
mod file_server;
mod guide_files;
mod guides;
mod hardware;
mod igdb;
mod menu;
mod report;
mod steam;
mod storage;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod testutil;

use serde::Serialize;
use tauri::Manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppDataInfo {
    app_data_dir: String,
    database_path: String,
    covers_dir: String,
    backups_dir: String,
}

#[tauri::command]
fn get_app_data_info(app: tauri::AppHandle) -> Result<AppDataInfo, String> {
    let paths = storage::initialize(&app).map_err(|error| error.to_string())?;

    Ok(AppDataInfo {
        app_data_dir: paths.app_data_dir.display().to_string(),
        database_path: paths.database_path.display().to_string(),
        covers_dir: paths.covers_dir.display().to_string(),
        backups_dir: paths.backups_dir.display().to_string(),
    })
}

pub fn run() {
    tauri::Builder::default()
        .manage(igdb::Igdb::default())
        .manage(backup::Backups::default())
        .manage(steam::Steam::default())
        .manage(archive::Archive::default())
        .register_uri_scheme_protocol("guidefile", |context, request| {
            // The reader asks for a guide file by id (and byte range); nothing else is served.
            let app = context.app_handle();
            let range = request
                .headers()
                .get("range")
                .and_then(|v| v.to_str().ok())
                .map(str::to_string);
            let served = match (app.path().app_data_dir(), commands::connection(app)) {
                (Ok(root), Ok(c)) => file_server::serve(
                    &c,
                    &root,
                    request.method().as_str(),
                    request.uri().path().trim_start_matches('/'),
                    range.as_deref(),
                ),
                _ => file_server::Served {
                    status: 500,
                    headers: vec![],
                    body: b"Unavailable".to_vec(),
                },
            };
            let mut response = tauri::http::Response::builder().status(served.status);
            for (name, value) in served.headers {
                response = response.header(name, value);
            }
            response
                .body(served.body)
                .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
        })
        .on_menu_event(menu::on_event)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if igdb::store::init().is_err() {
                eprintln!(
                    "{} initialization failed; local Library remains available",
                    igdb::store::NAME
                );
            }
            app.set_menu(menu::build(app.handle())?)?;
            storage::initialize(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_data_info,
            commands::list_games,
            commands::get_game,
            commands::save_game,
            commands::delete_game,
            commands::set_game_hidden,
            commands::set_game_panel,
            commands::backlog_set_order,
            commands::backlog_add,
            commands::backlog_remove,
            commands::list_hardware,
            commands::save_hardware,
            commands::delete_hardware,
            commands::list_guides,
            commands::save_guide,
            commands::delete_guide,
            commands::attach_guide_file,
            commands::remove_guide_file,
            commands::open_guide_file,
            commands::reveal_guide_file,
            commands::set_guide_file_position,
            commands::list_guide_bookmarks,
            commands::add_guide_bookmark,
            commands::rename_guide_bookmark,
            commands::delete_guide_bookmark,
            commands::list_platforms,
            commands::save_platform,
            commands::delete_platform,
            commands::get_preferences,
            commands::set_preference,
            commands::select_image,
            commands::image_data,
            commands::discard_image,
            commands::open_link,
            backup::backup_create,
            backup::backup_choose_restore,
            backup::backup_cancel_restore,
            backup::backup_restore,
            menu::about_info,
            steam::steam_config,
            steam::steam_save_credentials,
            steam::steam_clear_credentials,
            steam::steam_clear_cache,
            steam::steam_test,
            steam::steam_load,
            steam::steam_import,
            report::report_create,
            igdb::igdb_config,
            igdb::igdb_save_credentials,
            igdb::igdb_clear_credentials,
            igdb::igdb_test,
            igdb::igdb_search,
            igdb::igdb_thumbnail,
            igdb::igdb_import,
            archive::archive_search,
            archive::archive_item,
            archive::archive_open_page,
            archive::archive_cancel,
            archive::archive_download
        ])
        .run(tauri::generate_context!())
        .expect("failed to run XpieDB");
}
