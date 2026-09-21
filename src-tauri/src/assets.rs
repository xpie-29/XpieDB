use crate::catalog::Result;
use base64::{Engine, engine::general_purpose::STANDARD};
use image::{ImageFormat, ImageReader, Limits};
use rusqlite::Connection;
use std::{
    fs,
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
};
const MAX_BYTES: u64 = 20 * 1024 * 1024;

pub fn resolve(root: &Path, relative: &str) -> Result<PathBuf> {
    let parts: Vec<_> = relative.split('/').collect();
    if parts.len() != 2 || !["covers", "platform-icons"].contains(&parts[0]) {
        return Err("Invalid managed image path.".into());
    }
    let (stem, ext) = parts[1].rsplit_once('.').ok_or("Invalid image filename.")?;
    if uuid::Uuid::parse_str(stem).is_err() || !["jpg", "png", "webp"].contains(&ext) {
        return Err("Invalid image filename.".into());
    }
    let path = root.join(parts[0]).join(parts[1]);
    let canonical_root = root.canonicalize().map_err(|e| e.to_string())?;
    let parent = root.join(parts[0]);
    if parent.exists()
        && !parent
            .canonicalize()
            .map_err(|e| e.to_string())?
            .starts_with(&canonical_root)
    {
        return Err("Image directory is outside XpieDB storage.".into());
    }
    if path.exists() {
        let canonical = path.canonicalize().map_err(|e| e.to_string())?;
        if !canonical.starts_with(&canonical_root) {
            return Err("Image is outside XpieDB storage.".into());
        }
    }
    Ok(path)
}
pub fn validate_reference(root: &Path, relative: Option<&str>, kind: &str) -> Result<()> {
    if let Some(relative) = relative
        && (!relative.starts_with(&format!("{kind}/")) || !resolve(root, relative)?.is_file())
    {
        return Err("The selected managed image is missing or invalid.".into());
    }
    Ok(())
}
pub fn import(root: &Path, source: &Path, kind: &str) -> Result<String> {
    if !["covers", "platform-icons"].contains(&kind) {
        return Err("Invalid image destination.".into());
    }
    let file = fs::File::open(source).map_err(|e| format!("Cannot open image: {e}"))?;
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    import_bytes(root, &bytes, kind)
}
pub fn import_bytes(root: &Path, bytes: &[u8], kind: &str) -> Result<String> {
    if !["covers", "platform-icons"].contains(&kind) {
        return Err("Invalid image destination.".into());
    }
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Choose an image smaller than 20 MB.".into());
    }
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    let ext = match reader.format() {
        Some(ImageFormat::Png) => "png",
        Some(ImageFormat::Jpeg) => "jpg",
        Some(ImageFormat::WebP) => "webp",
        _ => return Err("Choose a PNG, JPEG, or WebP image.".into()),
    };
    let mut limits = Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    reader
        .decode()
        .map_err(|_| "This image is damaged or exceeds supported dimensions.".to_string())?;
    fs::create_dir_all(root.join(kind)).map_err(|e| e.to_string())?;
    let relative = format!("{kind}/{}.{}", uuid::Uuid::new_v4(), ext);
    let path = resolve(root, &relative)?;
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    if let Err(error) = output.write_all(bytes) {
        drop(output);
        let _ = fs::remove_file(path);
        return Err(error.to_string());
    }
    Ok(relative)
}
pub fn data_url(root: &Path, relative: &str) -> Result<String> {
    let path = resolve(root, relative)?;
    let file = fs::File::open(&path).map_err(|_| "Image unavailable.".to_string())?;
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Image is too large.".into());
    }
    let mime = match path.extension().and_then(|v| v.to_str()) {
        Some("jpg") => "image/jpeg",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        _ => return Err("Unsupported image.".into()),
    };
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}
pub fn remove_unused(c: &Connection, root: &Path, relative: &str) -> Result<()> {
    let path = resolve(root, relative)?;
    let used:bool=c.query_row("SELECT EXISTS(SELECT 1 FROM games WHERE cover_path=?1) OR EXISTS(SELECT 1 FROM platforms WHERE icon_path=?1)",[relative],|r|r.get(0)).map_err(|e|e.to_string())?;
    if !used && path.exists() {
        fs::remove_file(path).map_err(|e| format!("Cannot remove unused image: {e}"))?;
    }
    Ok(())
}
