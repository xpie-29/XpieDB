//! Internet Archive client: search for books, list an item's downloadable PDF and ePub files, and
//! download one. Read-only; no account or key is used, and only the search words and the chosen
//! item/file names are sent.
//!
//! Matching titles on the Archive is fuzzy, so search returns ranked candidates for the owner to
//! review; nothing is downloaded automatically. Items that are borrow-only (lending library, DRM)
//! are recognised and never downloaded.
use crate::catalog::Result;
use ammonia::Url;
use serde::Serialize;
use serde_json::Value;
use std::{
    fs,
    io::Write,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

const MAX_RESPONSE: usize = 8 * 1024 * 1024;
pub const RESULTS: usize = 25;
const USER_AGENT: &str = "XpieDB/0.1 (personal collection catalog)";
/// Words that suggest a guide, manual or map rather than the game's own box or a novel.
const GUIDE_WORDS: [&str; 14] = [
    "guide",
    "strategy",
    "walkthrough",
    "manual",
    "handbook",
    "prima",
    "brady",
    "official",
    "map",
    "atlas",
    "hint",
    "cheat",
    "secrets",
    "solution",
];

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Hit {
    pub identifier: String,
    pub title: String,
    pub creator: Option<String>,
    pub year: Option<String>,
    pub has_pdf: bool,
    pub has_epub: bool,
    /// Lending-library or DRM item: it can only be borrowed on archive.org.
    pub borrow_only: bool,
    pub downloads: u64,
    /// How well the title fits the search words and looks like a guide (higher is better).
    pub score: i64,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Found {
    pub hits: Vec<Hit>,
    /// The title-only search found nothing, so a wider search of all text fields was used.
    pub broadened: bool,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct FileChoice {
    pub name: String,
    pub kind: String,
    /// "Searchable text", "Scanned pages" or "".
    pub detail: String,
    pub size_bytes: u64,
    pub too_large: bool,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Item {
    pub identifier: String,
    pub title: String,
    pub borrow_only: bool,
    pub files: Vec<FileChoice>,
}

/// Search words made safe for the Archive's query language: letters, digits and apostrophes only.
pub fn words(text: &str) -> Vec<String> {
    text.split(|c: char| !(c.is_alphanumeric() || c == '\''))
        .map(|w| w.trim_matches('\'').to_lowercase())
        .filter(|w| !w.is_empty())
        .take(8)
        .collect()
}
fn title_query(words: &[String]) -> String {
    format!("title:({}) AND mediatype:texts", words.join(" AND "))
}
fn wide_query(words: &[String]) -> String {
    format!("({}) AND mediatype:texts", words.join(" AND "))
}
/// Item ids are lowercase letters, digits, dots, dashes and underscores.
pub fn valid_identifier(id: &str) -> bool {
    (1..=200).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_'))
        && !id.starts_with('.')
}
pub fn details_url(identifier: &str) -> Result<String> {
    if !valid_identifier(identifier) {
        return Err("That is not a valid Internet Archive item.".into());
    }
    Ok(format!("https://archive.org/details/{identifier}"))
}
/// The Archive may send downloads to its own storage servers (iaNNNN.us.archive.org) and nowhere else.
pub fn allowed_redirect(url: &Url) -> bool {
    url.scheme() == "https"
        && url
            .host_str()
            .is_some_and(|h| h == "archive.org" || h.ends_with(".archive.org"))
}

fn strings(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::String(s)) => vec![s.clone()],
        Some(Value::Number(n)) => vec![n.to_string()],
        Some(Value::Array(a)) => a.iter().flat_map(|v| strings(Some(v))).collect(),
        _ => vec![],
    }
}
fn truthy(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(b)) => *b,
        Some(Value::String(s)) => matches!(s.to_ascii_lowercase().as_str(), "true" | "1" | "yes"),
        _ => false,
    }
}
fn is_drm(format: &str) -> bool {
    let f = format.to_ascii_lowercase();
    f.contains("lcp") || f.contains("encrypted")
}
fn readable_pdf(format: &str) -> bool {
    let f = format.to_ascii_lowercase();
    f.contains("pdf") && !is_drm(&f)
}
fn readable_epub(format: &str) -> bool {
    let f = format.to_ascii_lowercase();
    f == "epub" || (f.contains("epub") && !is_drm(&f))
}

fn score(title: &str, query_words: &[String], hit: &Hit) -> i64 {
    let lower = title.to_lowercase();
    let found = query_words
        .iter()
        .filter(|w| lower.contains(w.as_str()))
        .count() as i64;
    let mut score = found * 10;
    if !query_words.is_empty() && found as usize == query_words.len() {
        score += 10;
    }
    if GUIDE_WORDS.iter().any(|w| lower.contains(w)) {
        score += 15;
    }
    if hit.has_pdf || hit.has_epub {
        score += 5;
    }
    if hit.borrow_only {
        score -= 20;
    }
    score
}
/// Ranks parsed search results and keeps the best few. Ties go to the more downloaded item.
fn parse_hits(json: &Value, query_words: &[String]) -> Vec<Hit> {
    let docs = json
        .pointer("/response/docs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut hits: Vec<Hit> = docs
        .iter()
        .filter_map(|doc| {
            let identifier = strings(doc.get("identifier")).into_iter().next()?;
            if !valid_identifier(&identifier) {
                return None;
            }
            let title = strings(doc.get("title")).into_iter().next()?;
            let formats = strings(doc.get("format"));
            let collections = strings(doc.get("collection"));
            let lending = collections
                .iter()
                .any(|c| ["inlibrary", "lendinglibrary", "printdisabled"].contains(&c.as_str()));
            let has_pdf = formats.iter().any(|f| readable_pdf(f));
            let has_epub = formats.iter().any(|f| readable_epub(f));
            let restricted = truthy(doc.get("access-restricted-item"))
                || formats.iter().any(|f| is_drm(f))
                || (lending && !has_pdf && !has_epub);
            let mut hit = Hit {
                identifier,
                title: title.chars().take(300).collect(),
                creator: strings(doc.get("creator")).into_iter().next(),
                year: strings(doc.get("year")).into_iter().next(),
                has_pdf,
                has_epub,
                borrow_only: restricted,
                downloads: strings(doc.get("downloads"))
                    .first()
                    .and_then(|d| d.parse().ok())
                    .unwrap_or(0),
                score: 0,
            };
            hit.score = score(&hit.title, query_words, &hit);
            Some(hit)
        })
        .collect();
    hits.sort_by(|a, b| b.score.cmp(&a.score).then(b.downloads.cmp(&a.downloads)));
    hits
}

fn parse_item(identifier: &str, json: &Value, max_bytes: u64) -> Item {
    let restricted = truthy(json.pointer("/metadata/access-restricted-item"));
    let title = strings(json.pointer("/metadata/title"))
        .into_iter()
        .next()
        .unwrap_or_else(|| identifier.to_string());
    let mut files: Vec<FileChoice> = json
        .get("files")
        .and_then(Value::as_array)
        .map(|files| {
            files
                .iter()
                .filter_map(|f| {
                    let name = f.get("name")?.as_str()?.to_string();
                    let format = f.get("format").and_then(Value::as_str).unwrap_or("");
                    let lower = name.to_ascii_lowercase();
                    // Only whole-book files in a name that cannot reach another folder.
                    if name.contains('/') || name.contains('\\') || name.starts_with('.') {
                        return None;
                    }
                    let kind = if lower.ends_with(".pdf")
                        && readable_pdf(if format.is_empty() { "pdf" } else { format })
                    {
                        "pdf"
                    } else if lower.ends_with(".epub") && !is_drm(format) {
                        "epub"
                    } else {
                        return None;
                    };
                    let size_bytes = f
                        .get("size")
                        .and_then(|s| {
                            s.as_str()
                                .map(str::to_string)
                                .or_else(|| s.as_u64().map(|n| n.to_string()))
                        })
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0);
                    let detail = match format {
                        "Text PDF" | "Additional Text PDF" => "Searchable text",
                        "Image Container PDF" => "Scanned pages",
                        _ => "",
                    };
                    Some(FileChoice {
                        name,
                        kind: kind.into(),
                        detail: detail.into(),
                        size_bytes,
                        too_large: size_bytes > max_bytes,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    // Searchable text first, then scans, then others; smaller first within each.
    let rank = |f: &FileChoice| match f.detail.as_str() {
        "Searchable text" => 0,
        "Scanned pages" => 2,
        _ if f.kind == "epub" => 1,
        _ => 3,
    };
    files.sort_by(|a, b| rank(a).cmp(&rank(b)).then(a.size_bytes.cmp(&b.size_bytes)));
    Item {
        identifier: identifier.into(),
        title,
        borrow_only: restricted,
        files,
    }
}

pub struct ArchiveClient {
    http: reqwest::Client,
    base: String,
}
fn status_error(status: u16) -> String {
    match status {
        401 | 403 => "This item is borrow-only on archive.org, so XpieDB cannot download it. Use \"Open on archive.org\" to borrow it there.".into(),
        404 => "The Internet Archive no longer has that item or file.".into(),
        429 => "The Internet Archive asked us to slow down. Wait a minute and try again.".into(),
        500..=599 => "The Internet Archive is having trouble right now. Try again later.".into(),
        _ => "The Internet Archive returned an unexpected response.".into(),
    }
}

impl ArchiveClient {
    pub fn new() -> Result<Self> {
        Ok(Self {
            http: reqwest::Client::builder()
                .https_only(true)
                .redirect(reqwest::redirect::Policy::custom(|attempt| {
                    if attempt.previous().len() < 5 && allowed_redirect(attempt.url()) {
                        attempt.follow()
                    } else {
                        attempt.error("redirect refused")
                    }
                }))
                .connect_timeout(Duration::from_secs(10))
                .read_timeout(Duration::from_secs(60))
                .user_agent(USER_AGENT)
                .build()
                .map_err(|_| "Could not initialize the secure HTTP client.")?,
            base: "https://archive.org".into(),
        })
    }
    /// Points the client at a local test server.
    #[cfg(test)]
    pub fn for_test(base: String) -> Self {
        Self {
            http: reqwest::Client::builder()
                .user_agent(USER_AGENT)
                .build()
                .unwrap(),
            base,
        }
    }
    async fn get_json(&self, url: Url) -> Result<Value> {
        let mut response = self.http.get(url).send().await.map_err(|_| {
            eprintln!("Internet Archive request failed");
            "Unable to reach the Internet Archive. Check your connection and try again.".to_string()
        })?;
        if !response.status().is_success() {
            return Err(status_error(response.status().as_u16()));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "Unable to reach the Internet Archive.".to_string())?
        {
            if bytes.len() + chunk.len() > MAX_RESPONSE {
                return Err("The Internet Archive's response was larger than expected.".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes)
            .map_err(|_| "The Internet Archive returned an unexpected response.".to_string())
    }
    async fn search_query(&self, query: &str) -> Result<Value> {
        let mut url = Url::parse(&format!("{}/advancedsearch.php", self.base))
            .map_err(|_| "Could not build the search.")?;
        {
            let mut pairs = url.query_pairs_mut();
            pairs.append_pair("q", query);
            for field in [
                "identifier",
                "title",
                "creator",
                "year",
                "format",
                "collection",
                "downloads",
                "access-restricted-item",
            ] {
                pairs.append_pair("fl[]", field);
            }
            pairs.append_pair("sort[]", "downloads desc");
            pairs.append_pair("rows", "60");
            pairs.append_pair("output", "json");
        }
        self.get_json(url).await
    }
    /// Searches for guides. Tries the words in the title first, then all text fields.
    pub async fn search(&self, text: &str) -> Result<Found> {
        let words = words(text);
        if words.is_empty() {
            return Err("Enter a game or guide name to search for.".into());
        }
        let mut broadened = false;
        let mut hits = parse_hits(&self.search_query(&title_query(&words)).await?, &words);
        if hits.is_empty() {
            broadened = true;
            hits = parse_hits(&self.search_query(&wide_query(&words)).await?, &words);
        }
        hits.truncate(RESULTS);
        Ok(Found { hits, broadened })
    }
    /// The downloadable PDF and ePub files of one item, read fresh from the Archive.
    pub async fn item(&self, identifier: &str, max_bytes: u64) -> Result<Item> {
        if !valid_identifier(identifier) {
            return Err("That is not a valid Internet Archive item.".into());
        }
        let mut url = Url::parse(&self.base).map_err(|_| "Could not build the request.")?;
        url.path_segments_mut()
            .map_err(|_| "Could not build the request.")?
            .extend(["metadata", identifier]);
        let json = self.get_json(url).await?;
        if json.as_object().is_none_or(|o| o.is_empty()) {
            return Err(status_error(404));
        }
        Ok(parse_item(identifier, &json, max_bytes))
    }
    /// Downloads one file of one item into `dest`, reporting progress, and stops (deleting what it
    /// wrote) if `cancel` is set or the size limit is passed. Returns the bytes written.
    pub async fn download(
        &self,
        identifier: &str,
        file_name: &str,
        dest: &Path,
        max_bytes: u64,
        cancel: &AtomicBool,
        mut progress: impl FnMut(u64, Option<u64>),
    ) -> Result<u64> {
        if !valid_identifier(identifier) {
            return Err("That is not a valid Internet Archive item.".into());
        }
        let mut url = Url::parse(&self.base).map_err(|_| "Could not build the request.")?;
        url.path_segments_mut()
            .map_err(|_| "Could not build the request.")?
            .extend(["download", identifier, file_name]);
        let mut response = self.http.get(url).send().await.map_err(|_| {
            eprintln!("Internet Archive download request failed");
            "Unable to reach the Internet Archive. Check your connection and try again.".to_string()
        })?;
        if !response.status().is_success() {
            return Err(status_error(response.status().as_u16()));
        }
        let total = response.content_length();
        if total.is_some_and(|t| t > max_bytes) {
            return Err(format!(
                "That file is larger than {} MB, the most XpieDB will keep.",
                max_bytes / (1024 * 1024)
            ));
        }
        let mut out = fs::File::create(dest).map_err(|e| e.to_string())?;
        let result = async {
            let mut written = 0u64;
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|_| "The download was interrupted. Try again.".to_string())?
            {
                if cancel.load(Ordering::Relaxed) {
                    return Err("Download cancelled.".to_string());
                }
                written += chunk.len() as u64;
                if written > max_bytes {
                    return Err("That file is larger than XpieDB will keep.".into());
                }
                out.write_all(&chunk).map_err(|e| e.to_string())?;
                progress(written, total);
            }
            out.sync_all().map_err(|e| e.to_string())?;
            Ok(written)
        }
        .await;
        if result.is_err() {
            drop(out);
            let _ = fs::remove_file(dest);
        }
        result
    }
}
