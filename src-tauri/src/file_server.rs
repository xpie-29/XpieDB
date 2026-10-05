//! Serves attached guide files to the in-app reader, by id, with byte-range support.
//!
//! Guides can be hundreds of megabytes, so the reader asks for pieces (PDF.js loads only the pages
//! it shows). The webview reaches this through the `guidefile` URL scheme; a request names a file
//! by its numeric id and nothing else, so there is no path to tamper with.
use crate::guide_files;
use rusqlite::Connection;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::Path,
};

/// The most bytes sent for one request.
pub const CHUNK: u64 = 4 * 1024 * 1024;
/// A request with no Range for a file up to this size gets the whole file.
pub const FULL_LIMIT: u64 = 64 * 1024 * 1024;

pub struct Served {
    pub status: u16,
    pub headers: Vec<(&'static str, String)>,
    pub body: Vec<u8>,
}

fn base_headers() -> Vec<(&'static str, String)> {
    vec![
        ("Access-Control-Allow-Origin", "*".into()),
        (
            "Access-Control-Expose-Headers",
            "Content-Range, Content-Length, Accept-Ranges".into(),
        ),
        ("Cache-Control", "private, max-age=0".into()),
    ]
}
fn plain(status: u16, message: &str) -> Served {
    let mut headers = base_headers();
    headers.push(("Content-Type", "text/plain; charset=utf-8".into()));
    Served {
        status,
        headers,
        body: message.as_bytes().to_vec(),
    }
}

enum Asked {
    /// No usable Range header: serve from the start.
    Whole,
    Bytes(u64, u64),
    Unsatisfiable,
}
fn parse_range(header: Option<&str>, len: u64) -> Asked {
    let Some(spec) = header.and_then(|h| h.trim().strip_prefix("bytes=")) else {
        return Asked::Whole;
    };
    if spec.contains(',') {
        return Asked::Whole;
    }
    let Some((from, to)) = spec.split_once('-') else {
        return Asked::Whole;
    };
    let (from, to) = (from.trim(), to.trim());
    if from.is_empty() {
        // "-N": the last N bytes.
        return match to.parse::<u64>() {
            Ok(0) => Asked::Unsatisfiable,
            Ok(n) if len > 0 => Asked::Bytes(len.saturating_sub(n), len - 1),
            Ok(_) => Asked::Unsatisfiable,
            Err(_) => Asked::Whole,
        };
    }
    let Ok(start) = from.parse::<u64>() else {
        return Asked::Whole;
    };
    let end = if to.is_empty() {
        len.saturating_sub(1)
    } else {
        match to.parse::<u64>() {
            Ok(end) if end >= start => end,
            _ => return Asked::Whole,
        }
    };
    if start >= len {
        Asked::Unsatisfiable
    } else {
        Asked::Bytes(start, end.min(len - 1))
    }
}

pub fn serve(
    c: &Connection,
    root: &Path,
    method: &str,
    id_text: &str,
    range: Option<&str>,
) -> Served {
    serve_with(c, root, method, id_text, range, CHUNK, FULL_LIMIT)
}
pub fn serve_with(
    c: &Connection,
    root: &Path,
    method: &str,
    id_text: &str,
    range: Option<&str>,
    chunk: u64,
    full_limit: u64,
) -> Served {
    if method == "OPTIONS" {
        let mut headers = base_headers();
        headers.push(("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS".into()));
        headers.push(("Access-Control-Allow-Headers", "Range".into()));
        headers.push(("Access-Control-Max-Age", "600".into()));
        return Served {
            status: 204,
            headers,
            body: vec![],
        };
    }
    if method != "GET" && method != "HEAD" {
        return plain(405, "Method not allowed");
    }
    let id: i64 = match id_text {
        t if !t.is_empty() && t.len() <= 18 && t.bytes().all(|b| b.is_ascii_digit()) => {
            t.parse().unwrap_or(0)
        }
        _ => return plain(404, "Not found"),
    };
    let Ok((path, kind)) = guide_files::file_info(c, root, id) else {
        return plain(404, "Not found");
    };
    let Ok(mut file) = fs::File::open(&path) else {
        return plain(404, "Not found");
    };
    let Ok(len) = file.metadata().map(|m| m.len()) else {
        return plain(404, "Not found");
    };
    let (start, end, partial) = match parse_range(range, len) {
        Asked::Unsatisfiable => {
            let mut headers = base_headers();
            headers.push(("Content-Range", format!("bytes */{len}")));
            return Served {
                status: 416,
                headers,
                body: vec![],
            };
        }
        Asked::Bytes(start, end) => (start, end.min(start + chunk - 1), true),
        Asked::Whole if len <= full_limit => (0, len.saturating_sub(1), false),
        Asked::Whole => (0, chunk.min(len) - 1, true),
    };
    let size = if len == 0 { 0 } else { end - start + 1 };
    let mut headers = base_headers();
    headers.push((
        "Content-Type",
        match kind.as_str() {
            "epub" => "application/epub+zip",
            _ => "application/pdf",
        }
        .into(),
    ));
    headers.push(("Accept-Ranges", "bytes".into()));
    headers.push(("Content-Length", size.to_string()));
    if partial {
        headers.push(("Content-Range", format!("bytes {start}-{end}/{len}")));
    }
    let mut body = Vec::new();
    if method == "GET" && size > 0 {
        if file.seek(SeekFrom::Start(start)).is_err() {
            return plain(500, "Could not read the file");
        }
        body.resize(size as usize, 0);
        if file.read_exact(&mut body).is_err() {
            return plain(500, "Could not read the file");
        }
    }
    Served {
        status: if partial { 206 } else { 200 },
        headers,
        body,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        guide_files::{self, MAX_BYTES},
        guides::{self, GuideInput},
        storage,
    };

    struct Env {
        dir: tempfile::TempDir,
        c: Connection,
        id: i64,
        bytes: Vec<u8>,
    }
    fn env() -> Env {
        let dir = tempfile::tempdir().unwrap();
        let c = Connection::open(dir.path().join("t.db")).unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        storage::run_migrations(&c).unwrap();
        let guide = guides::save_guide(
            &c,
            None,
            GuideInput {
                title: "G".into(),
                has_physical: false,
                ..Default::default()
            },
        )
        .unwrap()
        .id;
        let mut bytes = b"%PDF-1.4\n".to_vec();
        bytes.extend((0..991u32).map(|i| (i % 251) as u8));
        let source = dir.path().join("a.pdf");
        fs::write(&source, &bytes).unwrap();
        let id = guide_files::attach(&c, dir.path(), guide, &source, None, MAX_BYTES)
            .unwrap()
            .id;
        Env { dir, c, id, bytes }
    }
    fn header<'a>(served: &'a Served, name: &str) -> Option<&'a str> {
        served
            .headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
    fn get(e: &Env, range: Option<&str>) -> Served {
        serve_with(
            &e.c,
            e.dir.path(),
            "GET",
            &e.id.to_string(),
            range,
            300,
            2000,
        )
    }

    #[test]
    fn a_small_file_is_served_whole_with_range_support_advertised() {
        let e = env();
        let served = get(&e, None);
        assert_eq!(served.status, 200);
        assert_eq!(served.body, e.bytes);
        assert_eq!(header(&served, "Content-Type"), Some("application/pdf"));
        assert_eq!(header(&served, "Accept-Ranges"), Some("bytes"));
        assert_eq!(header(&served, "Content-Length"), Some("1000"));
        assert_eq!(header(&served, "Access-Control-Allow-Origin"), Some("*"));
        assert!(
            header(&served, "Access-Control-Expose-Headers")
                .unwrap()
                .contains("Content-Range")
        );
        assert!(header(&served, "Content-Range").is_none());
    }

    #[test]
    fn byte_ranges_return_exactly_those_bytes() {
        let e = env();
        for (range, from, to) in [
            ("bytes=0-99", 0, 99),
            ("bytes=100-199", 100, 199),
            ("bytes=950-", 950, 999),
            ("bytes=-50", 950, 999),
            ("bytes=990-5000", 990, 999),
            ("bytes=0-0", 0, 0),
        ] {
            let served = get(&e, Some(range));
            assert_eq!(served.status, 206, "{range}");
            assert_eq!(served.body, e.bytes[from..=to], "{range}");
            assert_eq!(
                header(&served, "Content-Range"),
                Some(format!("bytes {from}-{to}/1000").as_str()),
                "{range}"
            );
            assert_eq!(
                header(&served, "Content-Length"),
                Some((to - from + 1).to_string().as_str())
            );
        }
    }

    #[test]
    fn one_request_never_returns_more_than_the_chunk() {
        let e = env();
        let served = get(&e, Some("bytes=0-"));
        assert_eq!(served.status, 206);
        assert_eq!(served.body.len(), 300);
        assert_eq!(header(&served, "Content-Range"), Some("bytes 0-299/1000"));
        // A file above the whole-file limit with no Range also gets one chunk.
        let big = serve_with(&e.c, e.dir.path(), "GET", &e.id.to_string(), None, 300, 500);
        assert_eq!(big.status, 206);
        assert_eq!(big.body, e.bytes[..300]);
    }

    #[test]
    fn impossible_ranges_are_refused_and_odd_ones_ignored() {
        let e = env();
        for range in ["bytes=1000-", "bytes=5000-6000", "bytes=-0"] {
            let served = get(&e, Some(range));
            assert_eq!(served.status, 416, "{range}");
            assert_eq!(header(&served, "Content-Range"), Some("bytes */1000"));
            assert!(served.body.is_empty());
        }
        // Not understood: the whole file, as the standard allows.
        for range in [
            "items=0-5",
            "bytes=abc-def",
            "bytes=10-5",
            "bytes=0-5,10-20",
            "garbage",
        ] {
            let served = get(&e, Some(range));
            assert_eq!(served.status, 200, "{range}");
            assert_eq!(served.body.len(), 1000);
        }
    }

    #[test]
    fn head_and_options_work_and_other_methods_are_refused() {
        let e = env();
        let head = serve_with(
            &e.c,
            e.dir.path(),
            "HEAD",
            &e.id.to_string(),
            Some("bytes=0-9"),
            300,
            2000,
        );
        assert_eq!(head.status, 206);
        assert!(head.body.is_empty());
        assert_eq!(header(&head, "Content-Length"), Some("10"));
        let preflight = serve(&e.c, e.dir.path(), "OPTIONS", &e.id.to_string(), None);
        assert_eq!(preflight.status, 204);
        assert!(
            header(&preflight, "Access-Control-Allow-Headers")
                .unwrap()
                .contains("Range")
        );
        for method in ["POST", "PUT", "DELETE", "PATCH"] {
            assert_eq!(
                serve(&e.c, e.dir.path(), method, &e.id.to_string(), None).status,
                405
            );
        }
    }

    #[test]
    fn only_a_plain_number_naming_a_stored_file_is_served() {
        let e = env();
        for id in [
            "",
            "999",
            "-1",
            "1.5",
            "1/../1",
            "../x",
            "%2e%2e",
            "abc",
            &"9".repeat(19),
            " 1",
        ] {
            assert_eq!(
                serve(&e.c, e.dir.path(), "GET", id, None).status,
                404,
                "{id:?}"
            );
        }
        // A record whose copy has vanished is not served either.
        let path = guide_files::path_of(&e.c, e.dir.path(), e.id).unwrap();
        fs::remove_file(path).unwrap();
        assert_eq!(
            serve(&e.c, e.dir.path(), "GET", &e.id.to_string(), None).status,
            404
        );
    }
}
