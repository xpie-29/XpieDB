mod storage;

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
        .setup(|app| {
            storage::initialize(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_app_data_info])
        .run(tauri::generate_context!())
        .expect("failed to run GameVault");
}
