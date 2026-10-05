//! The Guides collection: strategy guides, manuals and similar books, optionally tied to a game.
//!
//! A guide can be linked to a game in the Library (`game_id`), or name a game you do not own
//! (`game_title`). Deleting a game keeps its guides (see `catalog::delete_game`).
use crate::catalog::{Result, clean_optional_field, sanitize_notes, valid_date};
use crate::hardware::CONDITIONS;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

const MAX_CENTS: i64 = 1_000_000_000;

fn db(error: rusqlite::Error) -> String {
    format!("The library could not be updated: {error}")
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct GuideInput {
    pub title: String,
    pub game_id: Option<i64>,
    /// The game's name when it is not linked to one in the Library.
    pub game_title: Option<String>,
    pub platform_id: Option<i64>,
    pub author: Option<String>,
    pub publisher: Option<String>,
    pub edition: Option<String>,
    pub isbn: Option<String>,
    pub language: Option<String>,
    pub page_count: Option<i64>,
    pub has_physical: bool,
    pub condition: Option<String>,
    pub purchase_date: Option<String>,
    pub purchase_price_cents: Option<i64>,
    pub purchase_source: Option<String>,
    pub photo_path: Option<String>,
    pub notes_html: String,
}
#[derive(Debug, Serialize)]
pub struct Guide {
    pub id: i64,
    #[serde(flatten)]
    pub data: GuideInput,
    pub date_added: String,
    pub date_modified: String,
}

/// ISBN-10 or ISBN-13, written with optional hyphens or spaces. Only the shape is checked, because
/// older guides and import editions often carry typos that should not block saving.
fn valid_isbn(value: &str) -> bool {
    let digits: Vec<char> = value.chars().filter(|c| !matches!(c, '-' | ' ')).collect();
    match digits.len() {
        10 => {
            digits[..9].iter().all(char::is_ascii_digit)
                && (digits[9].is_ascii_digit() || matches!(digits[9], 'X' | 'x'))
        }
        13 => digits.iter().all(char::is_ascii_digit),
        _ => false,
    }
}
fn validate(input: &mut GuideInput) -> Result<()> {
    input.title = input.title.trim().into();
    if input.title.is_empty() || input.title.len() > 300 {
        return Err("Enter a title of 1 to 300 characters.".into());
    }
    for value in [
        &mut input.game_title,
        &mut input.author,
        &mut input.publisher,
        &mut input.edition,
        &mut input.isbn,
        &mut input.language,
        &mut input.condition,
        &mut input.purchase_date,
        &mut input.purchase_source,
    ] {
        clean_optional_field(value)?;
    }
    if input.game_id.is_some() {
        // The linked game's own title is the source of truth.
        input.game_title = None;
    }
    if input
        .condition
        .as_deref()
        .is_some_and(|c| !CONDITIONS.contains(&c))
    {
        return Err("Choose a valid condition.".into());
    }
    if input.isbn.as_deref().is_some_and(|i| !valid_isbn(i)) {
        return Err("Enter a 10 or 13 digit ISBN, or leave it empty.".into());
    }
    if input.page_count.is_some_and(|p| !(1..=20_000).contains(&p)) {
        return Err("Enter a page count between 1 and 20,000.".into());
    }
    if input
        .purchase_date
        .as_deref()
        .is_some_and(|d| !valid_date(d))
    {
        return Err("Use a valid purchase date (YYYY-MM-DD).".into());
    }
    if input
        .purchase_price_cents
        .is_some_and(|c| !(0..=MAX_CENTS).contains(&c))
    {
        return Err("Enter a price between 0 and 10,000,000.".into());
    }
    if input.notes_html.len() > 100_000 {
        return Err("Notes are too long (maximum 100 KB).".into());
    }
    input.notes_html = sanitize_notes(&input.notes_html);
    Ok(())
}

const COLUMNS: &str = "id,title,game_id,game_title,platform_id,author,publisher,edition,isbn,language,\
    page_count,has_physical,condition,purchase_date,purchase_price_cents,purchase_source,photo_path,\
    notes_html,date_added,date_modified";

fn row(r: &rusqlite::Row) -> rusqlite::Result<Guide> {
    Ok(Guide {
        id: r.get(0)?,
        data: GuideInput {
            title: r.get(1)?,
            game_id: r.get(2)?,
            game_title: r.get(3)?,
            platform_id: r.get(4)?,
            author: r.get(5)?,
            publisher: r.get(6)?,
            edition: r.get(7)?,
            isbn: r.get(8)?,
            language: r.get(9)?,
            page_count: r.get(10)?,
            has_physical: r.get(11)?,
            condition: r.get(12)?,
            purchase_date: r.get(13)?,
            purchase_price_cents: r.get(14)?,
            purchase_source: r.get(15)?,
            photo_path: r.get(16)?,
            notes_html: sanitize_notes(&r.get::<_, String>(17)?),
        },
        date_added: r.get(18)?,
        date_modified: r.get(19)?,
    })
}
pub fn get_guide(c: &Connection, id: i64) -> Result<Guide> {
    c.query_row(
        &format!("SELECT {COLUMNS} FROM guides WHERE id=?1"),
        [id],
        row,
    )
    .optional()
    .map_err(db)?
    .ok_or_else(|| "This guide no longer exists.".to_string())
}
pub fn list_guides(c: &Connection) -> Result<Vec<Guide>> {
    let mut s = c
        .prepare(&format!(
            "SELECT {COLUMNS} FROM guides ORDER BY title COLLATE NOCASE,id"
        ))
        .map_err(db)?;
    s.query_map([], row)
        .map_err(db)?
        .collect::<std::result::Result<_, _>>()
        .map_err(db)
}
pub fn save_guide(c: &Connection, id: Option<i64>, mut input: GuideInput) -> Result<Guide> {
    validate(&mut input)?;
    let tx = c.unchecked_transaction().map_err(db)?;
    let exists =
        |sql: &str, id: i64| -> Result<bool> { tx.query_row(sql, [id], |r| r.get(0)).map_err(db) };
    if let Some(game) = input.game_id
        && !exists("SELECT EXISTS(SELECT 1 FROM games WHERE id=?)", game)?
    {
        return Err("Choose a game from your Library.".into());
    }
    if let Some(platform) = input.platform_id
        && !exists(
            "SELECT EXISTS(SELECT 1 FROM platforms WHERE id=?)",
            platform,
        )?
    {
        return Err("Choose an existing platform.".into());
    }
    let values = params![
        input.title,
        input.game_id,
        input.game_title,
        input.platform_id,
        input.author,
        input.publisher,
        input.edition,
        input.isbn,
        input.language,
        input.page_count,
        input.has_physical,
        input.condition,
        input.purchase_date,
        input.purchase_price_cents,
        input.purchase_source,
        input.photo_path,
        input.notes_html,
    ];
    let saved = match id {
        Some(id) => {
            let changed = tx
                .execute(
                    "UPDATE guides SET title=?1,game_id=?2,game_title=?3,platform_id=?4,author=?5,publisher=?6,\
                     edition=?7,isbn=?8,language=?9,page_count=?10,has_physical=?11,condition=?12,\
                     purchase_date=?13,purchase_price_cents=?14,purchase_source=?15,photo_path=?16,\
                     notes_html=?17,date_modified=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?18",
                    rusqlite::params_from_iter(
                        values
                            .iter()
                            .map(|v| v as &dyn rusqlite::ToSql)
                            .chain([&id as &dyn rusqlite::ToSql]),
                    ),
                )
                .map_err(db)?;
            if changed == 0 {
                return Err("This guide no longer exists.".into());
            }
            id
        }
        None => {
            tx.execute(
                "INSERT INTO guides(title,game_id,game_title,platform_id,author,publisher,edition,isbn,language,\
                 page_count,has_physical,condition,purchase_date,purchase_price_cents,purchase_source,photo_path,\
                 notes_html) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
                values,
            )
            .map_err(db)?;
            tx.last_insert_rowid()
        }
    };
    tx.commit().map_err(db)?;
    get_guide(c, saved)
}
/// Deletes a guide and returns its photo (if any) so the caller can remove an unused file.
pub fn delete_guide(c: &Connection, id: i64) -> Result<Option<String>> {
    let photo = get_guide(c, id)?.data.photo_path;
    c.execute("DELETE FROM guides WHERE id=?", [id])
        .map_err(db)?;
    Ok(photo)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::{self, GameInput};
    use crate::{assets, storage};

    fn database() -> (tempfile::TempDir, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let c = Connection::open(dir.path().join("test.db")).unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        storage::run_migrations(&c).unwrap();
        (dir, c)
    }
    fn guide(title: &str) -> GuideInput {
        GuideInput {
            title: title.into(),
            has_physical: true,
            ..Default::default()
        }
    }
    fn game(c: &Connection, title: &str) -> i64 {
        catalog::save_game(
            c,
            None,
            GameInput {
                title: title.into(),
                platform_id: 1,
                media_type: "Physical".into(),
                play_status: "Not Started".into(),
                ..Default::default()
            },
        )
        .unwrap()
        .id
    }

    #[test]
    fn every_field_round_trips_and_is_cleaned() {
        let (_dir, c) = database();
        let mut input = guide("  Official Strategy Guide  ");
        input.platform_id = Some(14);
        input.author = Some(" Prima Games ".into());
        input.publisher = Some("Prima".into());
        input.edition = Some("Collector's".into());
        input.isbn = Some("978-0-7615-4010-7".into());
        input.language = Some("English".into());
        input.page_count = Some(320);
        input.condition = Some("Good".into());
        input.purchase_date = Some("2024-02-29".into());
        input.purchase_price_cents = Some(1999);
        input.purchase_source = Some("  ".into());
        input.notes_html = "<p>Signed<script>x</script></p>".into();
        let saved = save_guide(&c, None, input).unwrap();
        let again = get_guide(&c, saved.id).unwrap();
        assert_eq!(again.data.title, "Official Strategy Guide");
        assert_eq!(again.data.author.as_deref(), Some("Prima Games"));
        assert_eq!(again.data.isbn.as_deref(), Some("978-0-7615-4010-7"));
        assert_eq!(again.data.page_count, Some(320));
        assert_eq!(again.data.purchase_source, None);
        assert_eq!(again.data.notes_html, "<p>Signed</p>");
        assert!(again.data.has_physical);
    }

    #[test]
    fn invalid_values_are_rejected() {
        let (_dir, c) = database();
        let bad: Vec<(&str, GuideInput)> = vec![
            ("title", guide("  ")),
            ("long title", guide(&"x".repeat(301))),
            (
                "condition",
                GuideInput {
                    condition: Some("Shiny".into()),
                    ..guide("X")
                },
            ),
            (
                "isbn short",
                GuideInput {
                    isbn: Some("12345".into()),
                    ..guide("X")
                },
            ),
            (
                "isbn letters",
                GuideInput {
                    isbn: Some("97807615401ab".into()),
                    ..guide("X")
                },
            ),
            (
                "pages zero",
                GuideInput {
                    page_count: Some(0),
                    ..guide("X")
                },
            ),
            (
                "pages huge",
                GuideInput {
                    page_count: Some(20_001),
                    ..guide("X")
                },
            ),
            (
                "date",
                GuideInput {
                    purchase_date: Some("2023-13-01".into()),
                    ..guide("X")
                },
            ),
            (
                "price",
                GuideInput {
                    purchase_price_cents: Some(-5),
                    ..guide("X")
                },
            ),
            (
                "game",
                GuideInput {
                    game_id: Some(9999),
                    ..guide("X")
                },
            ),
            (
                "platform",
                GuideInput {
                    platform_id: Some(9999),
                    ..guide("X")
                },
            ),
            (
                "notes",
                GuideInput {
                    notes_html: "x".repeat(100_001),
                    ..guide("X")
                },
            ),
        ];
        for (what, input) in bad {
            assert!(save_guide(&c, None, input).is_err(), "{what} should fail");
        }
        assert!(list_guides(&c).unwrap().is_empty());
        // An ISBN-10 with an X check digit and a spaced ISBN-13 are both fine.
        for isbn in ["0-306-40615-X", "0306406152", "978 0 306 40615 7"] {
            save_guide(
                &c,
                None,
                GuideInput {
                    isbn: Some(isbn.into()),
                    ..guide("OK")
                },
            )
            .unwrap();
        }
    }

    #[test]
    fn a_linked_game_wins_over_a_typed_title() {
        let (_dir, c) = database();
        let id = game(&c, "Chrono Trigger");
        let linked = save_guide(
            &c,
            None,
            GuideInput {
                game_id: Some(id),
                game_title: Some("typo".into()),
                ..guide("Guide")
            },
        )
        .unwrap();
        assert_eq!(linked.data.game_id, Some(id));
        assert_eq!(linked.data.game_title, None);
        let unlinked = save_guide(
            &c,
            None,
            GuideInput {
                game_title: Some("  Game I Do Not Own ".into()),
                ..guide("Other")
            },
        )
        .unwrap();
        assert_eq!(unlinked.data.game_id, None);
        assert_eq!(
            unlinked.data.game_title.as_deref(),
            Some("Game I Do Not Own")
        );
    }

    #[test]
    fn deleting_a_game_keeps_its_guides_and_remembers_the_title() {
        let (_dir, c) = database();
        let mine = game(&c, "Chrono Trigger");
        let other = game(&c, "Earthbound");
        let a = save_guide(
            &c,
            None,
            GuideInput {
                game_id: Some(mine),
                ..guide("CT guide")
            },
        )
        .unwrap();
        let b = save_guide(
            &c,
            None,
            GuideInput {
                game_id: Some(mine),
                ..guide("CT map")
            },
        )
        .unwrap();
        let c_guide = save_guide(
            &c,
            None,
            GuideInput {
                game_id: Some(other),
                ..guide("EB guide")
            },
        )
        .unwrap();
        catalog::delete_game(&c, mine).unwrap();
        for id in [a.id, b.id] {
            let g = get_guide(&c, id).unwrap();
            assert_eq!(g.data.game_id, None);
            assert_eq!(g.data.game_title.as_deref(), Some("Chrono Trigger"));
        }
        let untouched = get_guide(&c, c_guide.id).unwrap();
        assert_eq!(untouched.data.game_id, Some(other));
        assert_eq!(untouched.data.game_title, None);
        // Linking it again clears the remembered title.
        let relink = game(&c, "Chrono Trigger");
        let mut data = get_guide(&c, a.id).unwrap().data;
        data.game_id = Some(relink);
        let relinked = save_guide(&c, Some(a.id), data).unwrap();
        assert_eq!(relinked.data.game_title, None);
    }

    #[test]
    fn editing_and_deleting_missing_guides_fail_cleanly() {
        let (_dir, c) = database();
        assert!(save_guide(&c, Some(42), guide("Ghost")).is_err());
        assert!(delete_guide(&c, 42).is_err());
        let item = save_guide(
            &c,
            None,
            GuideInput {
                photo_path: Some("covers/x.png".into()),
                ..guide("G")
            },
        )
        .unwrap();
        assert_eq!(
            delete_guide(&c, item.id).unwrap().as_deref(),
            Some("covers/x.png")
        );
        assert!(get_guide(&c, item.id).is_err());
    }

    #[test]
    fn a_photo_is_kept_while_a_guide_uses_it_and_the_platform_cannot_be_deleted() {
        let (dir, c) = database();
        let mut bytes = Vec::new();
        image::RgbaImage::from_pixel(2, 2, image::Rgba([9, 9, 9, 255]))
            .write_to(
                &mut std::io::Cursor::new(&mut bytes),
                image::ImageFormat::Png,
            )
            .unwrap();
        let photo = assets::import_bytes(dir.path(), &bytes, "covers").unwrap();
        let item = save_guide(
            &c,
            None,
            GuideInput {
                photo_path: Some(photo.clone()),
                ..guide("G")
            },
        )
        .unwrap();
        assets::remove_unused(&c, dir.path(), &photo).unwrap();
        assert!(assets::resolve(dir.path(), &photo).unwrap().exists());
        delete_guide(&c, item.id).unwrap();
        assets::remove_unused(&c, dir.path(), &photo).unwrap();
        assert!(!assets::resolve(dir.path(), &photo).unwrap().exists());

        catalog::save_platform(&c, None, "Custom", "CU", None).unwrap();
        let custom = catalog::list_platforms(&c)
            .unwrap()
            .into_iter()
            .find(|p| p.name == "Custom")
            .unwrap()
            .id;
        save_guide(
            &c,
            None,
            GuideInput {
                platform_id: Some(custom),
                ..guide("P")
            },
        )
        .unwrap();
        assert!(catalog::delete_platform(&c, custom).is_err());
    }

    #[test]
    fn the_listing_is_ordered_by_title_ignoring_case() {
        let (_dir, c) = database();
        for title in ["zelda", "Atlas", "metroid", "Banjo"] {
            save_guide(&c, None, guide(title)).unwrap();
        }
        let titles: Vec<_> = list_guides(&c)
            .unwrap()
            .into_iter()
            .map(|g| g.data.title)
            .collect();
        assert_eq!(titles, ["Atlas", "Banjo", "metroid", "zelda"]);
    }
}
