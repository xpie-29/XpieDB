//! Digital copies of guides: PDF and ePub files copied into the app's `guide-files` folder.
//!
//! The frontend never supplies paths: Rust picks the file with a dialog, checks what it really is (by
//! content, not by name), copies it under a random name, and later opens it by id only.
use crate::catalog::Result;
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};

pub const DIR: &str = "guide-files";
/// Guides are often scanned books of 50 to 300 MB.
pub const MAX_BYTES: u64 = 1024 * 1024 * 1024;

fn db(error: rusqlite::Error) -> String {
    format!("The library could not be updated: {error}")
}

#[derive(Clone, Debug, Serialize)]
pub struct GuideFile {
    pub id: i64,
    pub guide_id: i64,
    pub file_name: String,
    pub kind: String,
    pub size_bytes: i64,
    pub source_url: Option<String>,
    pub date_added: String,
    /// The copy in the app folder is gone (for example after restoring a backup without guide files).
    pub missing: bool,
}

/// "pdf" or "epub" by looking inside the file, or None.
pub fn detect_kind(file: &mut fs::File) -> Result<Option<&'static str>> {
    let mut head = [0u8; 1024];
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    let read = file.read(&mut head).map_err(|e| e.to_string())?;
    if head[..read].windows(5).any(|w| w == b"%PDF-") {
        return Ok(Some("pdf"));
    }
    if read >= 4 && head[..4] == *b"PK\x03\x04" {
        file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        let Ok(mut zip) = zip::ZipArchive::new(&mut *file) else {
            return Ok(None);
        };
        let mut mimetype = String::new();
        let is_epub = match zip.by_name("mimetype") {
            Ok(entry) => entry
                .take(64)
                .read_to_string(&mut mimetype)
                .is_ok_and(|_| mimetype.trim() == "application/epub+zip"),
            Err(_) => false,
        };
        if is_epub && zip.by_name("META-INF/container.xml").is_ok() {
            return Ok(Some("epub"));
        }
    }
    Ok(None)
}

/// A name that is safe to show: no path, no control characters, at most 200 characters.
fn display_name(source: &Path) -> String {
    let name: String = source
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
        .chars()
        .filter(|c| !c.is_control())
        .take(200)
        .collect();
    if name.trim().is_empty() {
        "Guide".into()
    } else {
        name.trim().into()
    }
}

fn valid_stored_name(name: &str) -> bool {
    name.rsplit_once('.').is_some_and(|(stem, ext)| {
        uuid::Uuid::parse_str(stem).is_ok() && ["pdf", "epub"].contains(&ext)
    })
}
/// Where a stored copy lives. The name is checked, so it cannot point outside the folder.
pub fn stored_path(root: &Path, stored_name: &str) -> Result<PathBuf> {
    if !valid_stored_name(stored_name) {
        return Err("Invalid guide file.".into());
    }
    Ok(root.join(DIR).join(stored_name))
}

pub fn attach(
    c: &Connection,
    root: &Path,
    guide_id: i64,
    source: &Path,
    source_url: Option<&str>,
    max_bytes: u64,
) -> Result<GuideFile> {
    attach_as(
        c, root, guide_id, source, None, source_url, max_bytes, false,
    )
}
/// Attaches a file the app downloaded itself: it is checked like any other, then moved into place
/// (never copied again) and shown under `name`. The temporary file is removed if anything fails.
pub fn attach_downloaded(
    c: &Connection,
    root: &Path,
    guide_id: i64,
    temp: &Path,
    name: &str,
    source_url: Option<&str>,
    max_bytes: u64,
) -> Result<GuideFile> {
    let result = attach_as(
        c,
        root,
        guide_id,
        temp,
        Some(name),
        source_url,
        max_bytes,
        true,
    );
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}
#[allow(clippy::too_many_arguments)]
fn attach_as(
    c: &Connection,
    root: &Path,
    guide_id: i64,
    source: &Path,
    name: Option<&str>,
    source_url: Option<&str>,
    max_bytes: u64,
    move_file: bool,
) -> Result<GuideFile> {
    let exists: bool = c
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM guides WHERE id=?)",
            [guide_id],
            |r| r.get(0),
        )
        .map_err(db)?;
    if !exists {
        return Err("This guide no longer exists.".into());
    }
    let mut input = fs::File::open(source).map_err(|e| format!("Cannot open the file: {e}"))?;
    let size = input.metadata().map_err(|e| e.to_string())?.len();
    if size == 0 {
        return Err("This file is empty.".into());
    }
    if size > max_bytes {
        return Err(format!(
            "Choose a file smaller than {} MB.",
            max_bytes / (1024 * 1024)
        ));
    }
    let kind = detect_kind(&mut input)?.ok_or("Choose a PDF or ePub file.")?;
    fs::create_dir_all(root.join(DIR)).map_err(|e| e.to_string())?;
    let stored_name = format!("{}.{kind}", uuid::Uuid::new_v4());
    let target = stored_path(root, &stored_name)?;
    let temp = root.join(DIR).join(format!("{stored_name}.part"));
    let digest = (|| -> Result<String> {
        input.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        let mut out = if move_file {
            None
        } else {
            Some(
                fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&temp)
                    .map_err(|e| e.to_string())?,
            )
        };
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 256 * 1024];
        let mut total = 0u64;
        loop {
            let n = input.read(&mut buffer).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            total += n as u64;
            if total > max_bytes {
                return Err("The file grew while it was being copied.".into());
            }
            hasher.update(&buffer[..n]);
            if let Some(out) = out.as_mut() {
                out.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
            }
        }
        if let Some(out) = out {
            out.sync_all().map_err(|e| e.to_string())?;
        }
        Ok(hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect())
    })();
    let digest = match digest {
        Ok(d) => d,
        Err(e) => {
            let _ = fs::remove_file(&temp);
            return Err(e);
        }
    };
    let duplicate: bool = c
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM guide_files WHERE guide_id=?1 AND sha256=?2)",
            params![guide_id, digest],
            |r| r.get(0),
        )
        .map_err(db)?;
    if duplicate {
        let _ = fs::remove_file(&temp);
        return Err("This file is already attached to this guide.".into());
    }
    let from: &Path = if move_file { source } else { &temp };
    fs::rename(from, &target)
        .or_else(|_| {
            // Across volumes a rename fails: copy then delete.
            fs::copy(from, &target)
                .map(|_| ())
                .and_then(|()| fs::remove_file(from))
        })
        .map_err(|e| {
            let _ = fs::remove_file(&temp);
            e.to_string()
        })?;
    let inserted = c.execute(
        "INSERT INTO guide_files(guide_id,file_name,kind,stored_name,size_bytes,sha256,source_url) \
         VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![
            guide_id,
            name.map_or_else(|| display_name(source), |n| display_name(Path::new(n))),
            kind,
            stored_name,
            size as i64,
            digest,
            source_url
        ],
    );
    if let Err(e) = inserted {
        let _ = fs::remove_file(&target);
        return Err(db(e));
    }
    get(c, root, c.last_insert_rowid())
}

fn row(r: &rusqlite::Row, root: &Path) -> rusqlite::Result<GuideFile> {
    let stored: String = r.get(4)?;
    Ok(GuideFile {
        id: r.get(0)?,
        guide_id: r.get(1)?,
        file_name: r.get(2)?,
        kind: r.get(3)?,
        size_bytes: r.get(5)?,
        source_url: r.get(6)?,
        date_added: r.get(7)?,
        missing: stored_path(root, &stored).map_or(true, |p| !p.is_file()),
    })
}
const COLUMNS: &str = "id,guide_id,file_name,kind,stored_name,size_bytes,source_url,date_added";
pub fn get(c: &Connection, root: &Path, id: i64) -> Result<GuideFile> {
    c.query_row(
        &format!("SELECT {COLUMNS} FROM guide_files WHERE id=?1"),
        [id],
        |r| row(r, root),
    )
    .optional()
    .map_err(db)?
    .ok_or_else(|| "This guide file no longer exists.".to_string())
}
/// Every guide's files, by guide id, oldest first.
pub fn all_by_guide(c: &Connection, root: &Path) -> Result<HashMap<i64, Vec<GuideFile>>> {
    let mut map: HashMap<i64, Vec<GuideFile>> = HashMap::new();
    let mut s = c
        .prepare(&format!(
            "SELECT {COLUMNS} FROM guide_files ORDER BY date_added,id"
        ))
        .map_err(db)?;
    for file in s.query_map([], |r| row(r, root)).map_err(db)? {
        let file = file.map_err(db)?;
        map.entry(file.guide_id).or_default().push(file);
    }
    Ok(map)
}
pub fn stored_names_for_guide(c: &Connection, guide_id: i64) -> Result<Vec<String>> {
    c.prepare("SELECT stored_name FROM guide_files WHERE guide_id=?")
        .map_err(db)?
        .query_map([guide_id], |r| r.get(0))
        .map_err(db)?
        .collect::<std::result::Result<_, _>>()
        .map_err(db)
}
/// Where a file's copy is, by id.
pub fn path_of(c: &Connection, root: &Path, id: i64) -> Result<PathBuf> {
    let stored: String = c
        .query_row(
            "SELECT stored_name FROM guide_files WHERE id=?",
            [id],
            |r| r.get(0),
        )
        .optional()
        .map_err(db)?
        .ok_or("This guide file no longer exists.")?;
    let path = stored_path(root, &stored)?;
    if !path.is_file() {
        return Err(
            "The file is no longer in the app's folder. Remove it and attach it again.".into(),
        );
    }
    Ok(path)
}
/// Removes the record and its copy.
pub fn remove(c: &Connection, root: &Path, id: i64) -> Result<()> {
    let stored: String = c
        .query_row(
            "SELECT stored_name FROM guide_files WHERE id=?",
            [id],
            |r| r.get(0),
        )
        .optional()
        .map_err(db)?
        .ok_or("This guide file no longer exists.")?;
    c.execute("DELETE FROM guide_files WHERE id=?", [id])
        .map_err(db)?;
    delete_copies(root, &[stored]);
    Ok(())
}
/// Deletes stored copies, ignoring ones that are already gone.
pub fn delete_copies(root: &Path, stored_names: &[String]) {
    for name in stored_names {
        if let Ok(path) = stored_path(root, name)
            && let Err(e) = fs::remove_file(&path)
            && e.kind() != std::io::ErrorKind::NotFound
        {
            eprintln!("Cannot remove guide file: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::guides::{self, GuideInput};
    use crate::{catalog, storage};
    use std::io::Cursor;

    struct Env {
        dir: tempfile::TempDir,
        c: Connection,
        guide: i64,
    }
    fn env() -> Env {
        let dir = tempfile::tempdir().unwrap();
        let c = Connection::open(dir.path().join("test.db")).unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        storage::run_migrations(&c).unwrap();
        let guide = guides::save_guide(
            &c,
            None,
            GuideInput {
                title: "Guide".into(),
                has_physical: true,
                ..Default::default()
            },
        )
        .unwrap()
        .id;
        Env { dir, c, guide }
    }
    fn pdf_bytes(tag: u8) -> Vec<u8> {
        let mut bytes = b"%PDF-1.7\n%".to_vec();
        bytes.extend(std::iter::repeat_n(tag, 200));
        bytes.extend(b"\n%%EOF\n");
        bytes
    }
    fn epub_bytes(mimetype: &str, container: bool) -> Vec<u8> {
        let mut out = Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(&mut out);
        let stored = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        zip.start_file("mimetype", stored).unwrap();
        zip.write_all(mimetype.as_bytes()).unwrap();
        if container {
            zip.start_file("META-INF/container.xml", stored).unwrap();
            zip.write_all(b"<container/>").unwrap();
        }
        zip.finish().unwrap();
        out.into_inner()
    }
    fn write(env: &Env, name: &str, bytes: &[u8]) -> PathBuf {
        let path = env.dir.path().join(name);
        fs::write(&path, bytes).unwrap();
        path
    }
    fn attach_file(env: &Env, path: &Path) -> Result<GuideFile> {
        attach(&env.c, env.dir.path(), env.guide, path, None, MAX_BYTES)
    }

    #[test]
    fn a_pdf_is_copied_hashed_and_listed() {
        let e = env();
        let source = write(&e, "Walkthrough (v2).PDF", &pdf_bytes(1));
        let file = attach_file(&e, &source).unwrap();
        assert_eq!(file.kind, "pdf");
        assert_eq!(file.file_name, "Walkthrough (v2).PDF");
        assert_eq!(file.size_bytes, pdf_bytes(1).len() as i64);
        assert!(!file.missing);
        // A copy exists under a random name, and the original is untouched.
        let copy = path_of(&e.c, e.dir.path(), file.id).unwrap();
        assert_eq!(fs::read(&copy).unwrap(), pdf_bytes(1));
        assert!(copy.starts_with(e.dir.path().join(DIR)));
        assert!(source.is_file());
        let listed = all_by_guide(&e.c, e.dir.path()).unwrap();
        assert_eq!(listed[&e.guide].len(), 1);
        // No temporary files are left behind.
        let leftovers: Vec<_> = fs::read_dir(e.dir.path().join(DIR))
            .unwrap()
            .map(|f| f.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| n.ends_with(".part"))
            .collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn an_epub_is_recognised_by_its_content_whatever_the_name() {
        let e = env();
        let source = write(&e, "book.bin", &epub_bytes("application/epub+zip", true));
        let file = attach_file(&e, &source).unwrap();
        assert_eq!(file.kind, "epub");
        assert!(
            path_of(&e.c, e.dir.path(), file.id)
                .unwrap()
                .to_string_lossy()
                .ends_with(".epub")
        );
        // A PDF named .epub is still a PDF.
        let sneaky = write(&e, "sneaky.epub", &pdf_bytes(2));
        assert_eq!(attach_file(&e, &sneaky).unwrap().kind, "pdf");
    }

    #[test]
    fn other_files_are_refused_and_nothing_is_stored() {
        let e = env();
        let plain_zip = {
            let mut out = Cursor::new(Vec::new());
            let mut zip = zip::ZipWriter::new(&mut out);
            zip.start_file("a.txt", zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(b"hello").unwrap();
            zip.finish().unwrap();
            out.into_inner()
        };
        let cases: Vec<(&str, Vec<u8>)> = vec![
            ("text.pdf", b"just some text".to_vec()),
            ("empty.pdf", vec![]),
            ("image.png", b"\x89PNG\r\n\x1a\nxxxx".to_vec()),
            ("zip.epub", plain_zip),
            ("wrong-mimetype.epub", epub_bytes("application/zip", true)),
            (
                "no-container.epub",
                epub_bytes("application/epub+zip", false),
            ),
            ("truncated.epub", b"PK\x03\x04garbage".to_vec()),
        ];
        for (name, bytes) in cases {
            let source = write(&e, name, &bytes);
            assert!(
                attach_file(&e, &source).is_err(),
                "{name} should be refused"
            );
        }
        assert!(attach_file(&e, &e.dir.path().join("missing.pdf")).is_err());
        assert!(all_by_guide(&e.c, e.dir.path()).unwrap().is_empty());
        let stored = fs::read_dir(e.dir.path().join(DIR))
            .map(|d| d.count())
            .unwrap_or(0);
        assert_eq!(stored, 0);
    }

    #[test]
    fn size_limit_duplicates_and_unknown_guides() {
        let e = env();
        let source = write(&e, "a.pdf", &pdf_bytes(3));
        let tiny = attach(&e.c, e.dir.path(), e.guide, &source, None, 100);
        assert!(tiny.unwrap_err().contains("smaller than"));
        attach_file(&e, &source).unwrap();
        // The same content again is refused even under another name; another guide may hold it.
        let copy = write(&e, "renamed.pdf", &pdf_bytes(3));
        assert!(
            attach_file(&e, &copy)
                .unwrap_err()
                .contains("already attached")
        );
        let other = guides::save_guide(
            &e.c,
            None,
            GuideInput {
                title: "Other".into(),
                has_physical: true,
                ..Default::default()
            },
        )
        .unwrap()
        .id;
        attach(&e.c, e.dir.path(), other, &copy, None, MAX_BYTES).unwrap();
        assert!(attach(&e.c, e.dir.path(), 9999, &copy, None, MAX_BYTES).is_err());
        // Only the two accepted copies are stored.
        assert_eq!(fs::read_dir(e.dir.path().join(DIR)).unwrap().count(), 2);
    }

    #[test]
    fn removing_a_file_deletes_the_record_and_the_copy() {
        let e = env();
        let file = attach_file(&e, &write(&e, "a.pdf", &pdf_bytes(4))).unwrap();
        let copy = path_of(&e.c, e.dir.path(), file.id).unwrap();
        remove(&e.c, e.dir.path(), file.id).unwrap();
        assert!(!copy.exists());
        assert!(get(&e.c, e.dir.path(), file.id).is_err());
        assert!(remove(&e.c, e.dir.path(), file.id).is_err());
    }

    #[test]
    fn deleting_a_guide_removes_its_records_and_its_names_are_available_for_cleanup() {
        let e = env();
        let a = attach_file(&e, &write(&e, "a.pdf", &pdf_bytes(5))).unwrap();
        let b = attach_file(&e, &write(&e, "b.pdf", &pdf_bytes(6))).unwrap();
        let names = stored_names_for_guide(&e.c, e.guide).unwrap();
        assert_eq!(names.len(), 2);
        guides::delete_guide_with_files(&e.c, e.dir.path(), e.guide).unwrap();
        assert!(get(&e.c, e.dir.path(), a.id).is_err());
        assert!(get(&e.c, e.dir.path(), b.id).is_err());
        // The guide's copies are gone from disk too.
        for name in names {
            assert!(!stored_path(e.dir.path(), &name).unwrap().exists());
        }
    }

    #[test]
    fn a_vanished_copy_is_reported_as_missing_and_cannot_be_opened() {
        let e = env();
        let file = attach_file(&e, &write(&e, "a.pdf", &pdf_bytes(7))).unwrap();
        let copy = path_of(&e.c, e.dir.path(), file.id).unwrap();
        fs::remove_file(copy).unwrap();
        assert!(get(&e.c, e.dir.path(), file.id).unwrap().missing);
        assert!(all_by_guide(&e.c, e.dir.path()).unwrap()[&e.guide][0].missing);
        assert!(
            path_of(&e.c, e.dir.path(), file.id)
                .unwrap_err()
                .contains("attach it again")
        );
        // Removing the record still works.
        remove(&e.c, e.dir.path(), file.id).unwrap();
    }

    #[test]
    fn only_generated_names_can_be_resolved() {
        let root = Path::new("/tmp/root");
        let good = format!("{}.pdf", uuid::Uuid::new_v4());
        assert!(stored_path(root, &good).is_ok());
        for bad in [
            "../x.pdf",
            "a/b.pdf",
            "x.pdf",
            "..",
            "",
            &format!("{}.exe", uuid::Uuid::new_v4()),
        ] {
            assert!(stored_path(root, bad).is_err(), "{bad}");
        }
        let _ = catalog::STATUSES;
    }

    #[test]
    fn display_names_are_cleaned() {
        assert_eq!(display_name(Path::new("/a/b/Guide.pdf")), "Guide.pdf");
        assert_eq!(
            display_name(Path::new("/a/b/bad\u{7}name.pdf")),
            "badname.pdf"
        );
        assert_eq!(display_name(Path::new("/")), "Guide");
        assert_eq!(
            display_name(Path::new(&format!("/x/{}.pdf", "n".repeat(300))))
                .chars()
                .count(),
            200
        );
    }
}
