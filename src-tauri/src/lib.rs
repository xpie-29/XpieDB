mod assets;
mod backup;
mod catalog;
mod commands;
mod igdb;
mod report;
mod storage;
#[cfg(test)]
mod tests;

use serde::Serialize;

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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if igdb::store::init().is_err() {
                eprintln!(
                    "{} initialization failed; local Library remains available",
                    igdb::store::NAME
                );
            }
            storage::initialize(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_data_info,
            commands::list_games,
            commands::get_game,
            commands::save_game,
            commands::delete_game,
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
            report::report_create,
            igdb::igdb_config,
            igdb::igdb_save_credentials,
            igdb::igdb_clear_credentials,
            igdb::igdb_test,
            igdb::igdb_search,
            igdb::igdb_thumbnail,
            igdb::igdb_import
        ])
        .run(tauri::generate_context!())
        .expect("failed to run XpieDB");
}
