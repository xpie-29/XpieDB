//! Find a digital copy of a guide on the Internet Archive, review the matches, and download one.
//!
//! This only ever adds: a downloaded file becomes a digital copy of a guide (an existing one, or a new
//! guide created for it), and nothing else in the library changes. The frontend names an item and a file
//! by their Archive ids, never a URL: Rust re-reads the item and refuses anything not listed as a
//! downloadable PDF or ePub of an item that is not borrow-only.
pub mod api;
#[cfg(test)]
mod tests;

use crate::{
    assets,
    catalog::Result,
    commands::connection,
    guide_files::{self, GuideFile},
    guides::{self, Guide, GuideInput},
};
use api::{ArchiveClient, Found, Item};
use serde::{Deserialize, Serialize};
use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

const PROGRESS_EVENT: &str = "archive-progress";

/// One download at a time, politely, with a way to stop it.
#[derive(Default)]
pub struct Archive {
    cancel: AtomicBool,
    busy: AtomicBool,
}

#[derive(Serialize, Clone)]
struct Progress {
    received: u64,
    total: Option<u64>,
}

#[derive(Deserialize)]
pub struct DownloadRequest {
    pub identifier: String,
    pub file_name: String,
    /// Attach to this existing guide...
    pub guide_id: Option<i64>,
    /// ...or create this one once the file has arrived.
    pub new_guide: Option<GuideInput>,
}

fn root(app: &AppHandle) -> Result<std::path::PathBuf> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn archive_search(query: String) -> Result<Found> {
    ArchiveClient::new()?.search(&query).await
}
#[tauri::command]
pub async fn archive_item(identifier: String) -> Result<Item> {
    ArchiveClient::new()?
        .item(&identifier, guide_files::MAX_BYTES)
        .await
}
/// Opens the item's page on archive.org in the browser (the URL is built here, from the id).
#[tauri::command]
pub fn archive_open_page(app: AppHandle, identifier: String) -> Result<()> {
    app.opener()
        .open_url(api::details_url(&identifier)?, None::<&str>)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn archive_cancel(state: State<'_, Archive>) {
    state.cancel.store(true, Ordering::Relaxed);
}

/// Releases the "download running" flag however the download ends.
struct Busy<'a>(&'a AtomicBool);
impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Relaxed);
    }
}

#[tauri::command]
pub async fn archive_download(
    app: AppHandle,
    state: State<'_, Archive>,
    request: DownloadRequest,
) -> Result<Guide> {
    if state.busy.swap(true, Ordering::Relaxed) {
        return Err("A download is already running. Wait for it or cancel it.".into());
    }
    let _busy = Busy(&state.busy);
    state.cancel.store(false, Ordering::Relaxed);
    if request.guide_id.is_some() == request.new_guide.is_some() {
        return Err("Choose a guide to attach the file to.".into());
    }
    if request
        .new_guide
        .as_ref()
        .is_some_and(|g| g.photo_path.is_some())
    {
        return Err("A guide created from a download cannot have a photo yet.".into());
    }
    let root = root(&app)?;
    // The target must exist before a large file is fetched for it.
    if let Some(id) = request.guide_id {
        guides::get_guide(&connection(&app)?, id)?;
    }
    let client = ArchiveClient::new()?;
    let item = client
        .item(&request.identifier, guide_files::MAX_BYTES)
        .await?;
    if item.borrow_only {
        return Err("This item is borrow-only on archive.org, so XpieDB cannot download it. Use \"Open on archive.org\" to borrow it there.".into());
    }
    let file = item
        .files
        .iter()
        .find(|f| f.name == request.file_name)
        .ok_or("That file is not one of this item's downloadable PDF or ePub files.")?;
    if file.too_large {
        return Err("That file is larger than XpieDB will keep (1 GB).".into());
    }
    let temp = root.join(format!(".archive-{}.part", uuid::Uuid::new_v4()));
    let mut last = Instant::now() - Duration::from_secs(1);
    client
        .download(
            &request.identifier,
            &request.file_name,
            &temp,
            guide_files::MAX_BYTES,
            &state.cancel,
            |received, total| {
                if last.elapsed() >= Duration::from_millis(200) {
                    last = Instant::now();
                    let _ = app.emit(PROGRESS_EVENT, Progress { received, total });
                }
            },
        )
        .await?;
    let source = api::details_url(&request.identifier)?;
    let c = connection(&app)?;
    let (guide_id, created) = match (request.guide_id, request.new_guide) {
        (Some(id), _) => (id, false),
        (None, Some(input)) => match guides::save_guide(&c, None, input) {
            Ok(guide) => (guide.id, true),
            Err(e) => {
                let _ = std::fs::remove_file(&temp);
                return Err(e);
            }
        },
        (None, None) => unreachable!("checked above"),
    };
    let attached: Result<GuideFile> = guide_files::attach_downloaded(
        &c,
        &root,
        guide_id,
        &temp,
        &request.file_name,
        Some(&source),
        guide_files::MAX_BYTES,
    );
    if let Err(e) = attached {
        if created {
            // Do not leave an empty guide behind for a download that failed.
            let photo = guides::delete_guide_with_files(&c, &root, guide_id)
                .ok()
                .flatten();
            if let Some(photo) = photo {
                let _ = assets::remove_unused(&c, &root, &photo);
            }
        }
        return Err(e);
    }
    let mut guide = guides::get_guide(&c, guide_id)?;
    guides::with_files(&c, &root, std::slice::from_mut(&mut guide))?;
    Ok(guide)
}
