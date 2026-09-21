//! PDF reports over the local catalog.
//!
//! A report is described by a small request (grouping, paper, columns), turned into
//! a plain `Report` model, laid out into pages, and written as a PDF. Adding a new
//! grouping or sort means extending `build`; layout and output do not change. The
//! frontend never supplies a path: Rust owns the save dialog and the file.
mod layout;
#[cfg(test)]
mod tests;

use crate::{
    catalog::{Game, Platform, Result},
    commands,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GroupBy {
    None,
    Platform,
    /// Only backlog games, in the order set by hand, numbered.
    Backlog,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Paper {
    Letter,
    A4,
}

/// Optional columns; the title column is always present.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Column {
    Platform,
    Year,
    Genre,
    Status,
    Rating,
    Account,
    MediaType,
}

/// Fixed print order, whatever order the request lists them in.
const COLUMN_ORDER: [Column; 7] = [
    Column::Platform,
    Column::Year,
    Column::Genre,
    Column::Status,
    Column::Rating,
    Column::Account,
    Column::MediaType,
];

#[derive(Clone, Debug, Deserialize)]
pub struct ReportRequest {
    pub group_by: GroupBy,
    pub paper: Paper,
    pub landscape: bool,
    pub columns: Vec<Column>,
}

#[derive(Debug)]
pub struct Report {
    pub title: String,
    pub subtitle: String,
    /// Optional columns after the title, in print order.
    pub columns: Vec<Column>,
    pub sections: Vec<Section>,
    pub games: usize,
    /// True when each row starts with its position number, before the title.
    pub numbered: bool,
    /// Shown instead of the table when there are no rows.
    pub empty_message: String,
}

#[derive(Debug)]
pub struct Section {
    pub heading: Option<String>,
    pub rows: Vec<Row>,
}

/// One printed row. Cells follow the printed columns: the position number (only
/// when `Report::numbered`), then the title, then `Report::columns`.
#[derive(Debug)]
pub struct Row {
    pub cells: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ReportResult {
    pub path: String,
    pub games: usize,
    pub pages: usize,
    /// Characters the bundled font cannot print (for example CJK), shown as `?`.
    pub unsupported_characters: usize,
}

/// Sort key for titles: accents and case ignored, spacing collapsed, and numbers
/// compared by value so "Vol. 2" comes before "Vol. 10". Digits sort before letters.
pub fn sort_key(text: &str) -> String {
    let folded: String = text
        .nfd()
        .filter(|c| !is_combining_mark(*c))
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let mut key = String::with_capacity(folded.len() + 16);
    let mut digits = String::new();
    let flush = |digits: &mut String, key: &mut String| {
        // Left-pad so shorter numbers compare lower; leading zeros carry no value.
        let trimmed = digits.trim_start_matches('0');
        let trimmed = if trimmed.is_empty() && !digits.is_empty() {
            "0"
        } else {
            trimmed
        };
        if !trimmed.is_empty() {
            key.push_str(&"0".repeat(20usize.saturating_sub(trimmed.len())));
            key.push_str(trimmed);
        }
        digits.clear();
    };
    for c in folded.chars() {
        if c.is_ascii_digit() {
            digits.push(c);
        } else {
            flush(&mut digits, &mut key);
            key.push(c);
        }
    }
    flush(&mut digits, &mut key);
    key
}

fn year(date: Option<&str>) -> String {
    date.and_then(|d| d.get(..4))
        .filter(|y| y.chars().all(|c| c.is_ascii_digit()))
        .unwrap_or_default()
        .to_string()
}

fn stars(rating: Option<i64>) -> String {
    match rating {
        Some(r) if (1..=5).contains(&r) => {
            let r = r as usize;
            "★".repeat(r) + &"☆".repeat(5 - r)
        }
        _ => String::new(),
    }
}

fn cell(game: &Game, platform: &str, column: Column) -> String {
    let d = &game.data;
    let text = |v: &Option<String>| v.clone().unwrap_or_default();
    match column {
        Column::Platform => platform.to_string(),
        Column::Year => year(d.release_date.as_deref()),
        Column::Genre => text(&d.genre),
        Column::Status => d.play_status.clone(),
        Column::Rating => stars(d.rating),
        Column::Account => text(&d.account),
        Column::MediaType => d.media_type.clone(),
    }
}

/// Columns actually printed. Platform is implied by the heading when grouping by it.
pub fn columns_for(request: &ReportRequest) -> Vec<Column> {
    let wanted: HashSet<_> = request.columns.iter().copied().collect();
    COLUMN_ORDER
        .into_iter()
        .filter(|c| wanted.contains(c))
        .filter(|c| !(request.group_by == GroupBy::Platform && *c == Column::Platform))
        .collect()
}

/// Turns catalog records into a printable model. `generated` is a display date.
pub fn build(
    games: &[Game],
    platforms: &[Platform],
    request: &ReportRequest,
    generated: &str,
) -> Report {
    let columns = columns_for(request);
    let names: HashMap<i64, &str> = platforms.iter().map(|p| (p.id, p.name.as_str())).collect();
    let name_of = |game: &Game| {
        names
            .get(&game.data.platform_id)
            .copied()
            .unwrap_or("Unknown platform")
    };

    if request.group_by == GroupBy::Backlog {
        return build_backlog(games, columns, &names, generated);
    }
    let mut ordered: Vec<&Game> = games.iter().collect();
    ordered.sort_by(|a, b| {
        sort_key(&a.data.title)
            .cmp(&sort_key(&b.data.title))
            .then_with(|| a.data.title.cmp(&b.data.title))
            .then_with(|| a.id.cmp(&b.id))
    });
    let row = |game: &Game| Row {
        cells: std::iter::once(game.data.title.clone())
            .chain(columns.iter().map(|c| cell(game, name_of(game), *c)))
            .collect(),
    };

    let (title, sections) = match request.group_by {
        GroupBy::Backlog => unreachable!("handled above"),
        GroupBy::None => (
            "All Games".to_string(),
            vec![Section {
                heading: None,
                rows: ordered.iter().map(|g| row(g)).collect(),
            }],
        ),
        GroupBy::Platform => {
            let mut groups: HashMap<&str, Vec<Row>> = HashMap::new();
            for game in &ordered {
                groups.entry(name_of(game)).or_default().push(row(game));
            }
            let mut groups: Vec<_> = groups.into_iter().collect();
            groups.sort_by(|a, b| sort_key(a.0).cmp(&sort_key(b.0)).then_with(|| a.0.cmp(b.0)));
            (
                "Games by Platform".to_string(),
                groups
                    .into_iter()
                    .map(|(name, rows)| Section {
                        heading: Some(name.to_string()),
                        rows,
                    })
                    .collect(),
            )
        }
    };
    let count = games.len();
    let mut subtitle = format!("{generated}  ·  {count} {}", plural(count, "game"));
    if request.group_by == GroupBy::Platform {
        let n = sections.len();
        subtitle.push_str(&format!("  ·  {n} {}", plural(n, "platform")));
    }
    Report {
        title,
        subtitle,
        columns,
        sections,
        games: count,
        numbered: false,
        empty_message: "There are no games in the library.".into(),
    }
}

fn platform_name<'a>(names: &HashMap<i64, &'a str>, game: &Game) -> &'a str {
    names
        .get(&game.data.platform_id)
        .copied()
        .unwrap_or("Unknown platform")
}

/// The backlog report: only games with a backlog position, in that order.
fn build_backlog(
    games: &[Game],
    columns: Vec<Column>,
    names: &HashMap<i64, &str>,
    generated: &str,
) -> Report {
    let mut queued: Vec<&Game> = games
        .iter()
        .filter(|g| g.backlog_position.is_some())
        .collect();
    queued.sort_by_key(|g| (g.backlog_position, g.id));
    let rows: Vec<Row> = queued
        .iter()
        .map(|g| Row {
            cells: [g.backlog_position.unwrap_or_default().to_string()]
                .into_iter()
                .chain([g.data.title.clone()])
                .chain(columns.iter().map(|c| cell(g, platform_name(names, g), *c)))
                .collect(),
        })
        .collect();
    let count = rows.len();
    Report {
        title: "Backlog".into(),
        subtitle: format!(
            "{generated}  ·  {count} {}, in order",
            plural(count, "game")
        ),
        columns,
        sections: vec![Section {
            heading: None,
            rows,
        }],
        games: count,
        numbered: true,
        empty_message: "The backlog is empty.".into(),
    }
}

fn plural(n: usize, word: &str) -> String {
    if n == 1 {
        word.into()
    } else {
        format!("{word}s")
    }
}

fn today() -> Result<String> {
    Connection::open_in_memory()
        .and_then(|c| {
            c.query_row("SELECT strftime('%Y-%m-%d','now','localtime')", [], |r| {
                r.get(0)
            })
        })
        .map_err(|e| e.to_string())
}

/// Builds the report and writes it to `dest`, replacing any existing file only
/// once the whole PDF has been produced.
pub fn write(
    games: &[Game],
    platforms: &[Platform],
    request: &ReportRequest,
    generated: &str,
    dest: &Path,
) -> Result<ReportResult> {
    let report = build(games, platforms, request, generated);
    let rendered = layout::render(&report, request.paper, request.landscape)?;
    let mut part = dest.as_os_str().to_owned();
    part.push(".part");
    let part = std::path::PathBuf::from(part);
    if let Err(e) = fs::write(&part, &rendered.bytes).and_then(|_| fs::rename(&part, dest)) {
        let _ = fs::remove_file(&part);
        return Err(format!("The report could not be saved: {e}"));
    }
    Ok(ReportResult {
        path: dest.display().to_string(),
        games: report.games,
        pages: rendered.pages,
        unsupported_characters: rendered.unsupported,
    })
}

#[tauri::command]
pub async fn report_create(app: AppHandle, request: ReportRequest) -> Result<Option<ReportResult>> {
    let date = today()?;
    let name = match request.group_by {
        GroupBy::None => "All-Games",
        GroupBy::Platform => "Games-by-Platform",
        GroupBy::Backlog => "Backlog",
    };
    let Some(chosen) = app
        .dialog()
        .file()
        .add_filter("PDF document", &["pdf"])
        .set_file_name(format!("XpieDB-{name}-{date}.pdf"))
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let mut dest = chosen.into_path().map_err(|e| e.to_string())?;
    if dest.extension().is_none() {
        dest.set_extension("pdf");
    }
    tauri::async_runtime::spawn_blocking(move || {
        let connection = commands::connection(&app)?;
        let games = crate::catalog::list_games(&connection)?;
        let platforms = crate::catalog::list_platforms(&connection)?;
        write(&games, &platforms, &request, &date, &dest).map(Some)
    })
    .await
    .map_err(|e| e.to_string())?
}
