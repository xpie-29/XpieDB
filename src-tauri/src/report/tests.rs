use super::layout::{Layout, Op, layout, render, text_width};
use super::*;
use crate::catalog::GameInput;

const ALL_COLUMNS: [Column; 7] = [
    Column::Platform,
    Column::Year,
    Column::Genre,
    Column::Status,
    Column::Rating,
    Column::Account,
    Column::MediaType,
];

fn game(id: i64, title: &str, platform: i64) -> Game {
    Game {
        id,
        data: GameInput {
            title: title.into(),
            platform_id: platform,
            media_type: "Physical".into(),
            play_status: "Not Started".into(),
            ..Default::default()
        },
        date_added: String::new(),
        date_modified: String::new(),
    }
}
fn platform(id: i64, name: &str) -> Platform {
    Platform {
        id,
        name: name.into(),
        short_name: name.chars().take(3).collect(),
        icon_path: None,
        sort_order: id,
        is_builtin: true,
    }
}
fn platforms() -> Vec<Platform> {
    vec![
        platform(1, "PlayStation 4"),
        platform(2, "Nintendo Switch"),
        platform(3, "PC"),
        platform(4, "Empty Platform"),
    ]
}
fn request(group_by: GroupBy, columns: &[Column]) -> ReportRequest {
    ReportRequest {
        group_by,
        paper: Paper::Letter,
        landscape: false,
        columns: columns.to_vec(),
    }
}
fn titles(section: &Section) -> Vec<&str> {
    section.rows.iter().map(|r| r.cells[0].as_str()).collect()
}
/// A library large enough to paginate, with predictable, mixed-case titles.
fn big_library(count: usize) -> Vec<Game> {
    (0..count)
        .map(|i| {
            let mut g = game(
                i as i64 + 1,
                &format!(
                    "Game {:04} {}",
                    (i * 7919) % count,
                    if i % 3 == 0 {
                        "of the Long Title Edition"
                    } else {
                        ""
                    }
                ),
                (i % 3) as i64 + 1,
            );
            g.data.genre = Some("Action, Adventure".into());
            g.data.rating = Some((i % 5) as i64 + 1);
            g
        })
        .collect()
}
/// (x, y, size, bold, gray, text) of a drawn text run.
type Run<'a> = (f32, f32, f32, bool, u8, &'a str);

fn texts(layout: &Layout) -> Vec<Vec<Run<'_>>> {
    layout
        .pages
        .iter()
        .map(|ops| {
            ops.iter()
                .filter_map(|op| match op {
                    Op::Text {
                        x,
                        y,
                        size,
                        bold,
                        gray,
                        text,
                    } => Some((*x, *y, *size, *bold, *gray, text.as_str())),
                    _ => None,
                })
                .collect()
        })
        .collect()
}
/// Title-column body text (regular, ink, at the left margin) in reading order.
fn first_column(layout: &Layout) -> Vec<String> {
    texts(layout)
        .into_iter()
        .flatten()
        .filter(|(x, _, size, bold, gray, _)| *x == 42.0 && *size == 9.5 && !*bold && *gray == 0)
        .map(|t| t.5.to_string())
        .collect()
}

#[test]
fn title_ordering_ignores_case_and_accents_and_puts_digits_first() {
    let library = vec![
        game(1, "zelda", 1),
        game(2, "Éclipse", 1),
        game(3, "alpha", 1),
        game(4, "  Ark   2 ", 1),
        game(5, "Ark", 1),
        game(6, "10 Yard Fight", 1),
        game(7, "Ōkami", 1),
        game(8, "Okami Den", 1),
    ];
    let report = build(&library, &platforms(), &request(GroupBy::None, &[]), "d");
    assert_eq!(
        titles(&report.sections[0]),
        [
            "10 Yard Fight",
            "alpha",
            "Ark",
            "  Ark   2 ",
            "Éclipse",
            "Ōkami",
            "Okami Den",
            "zelda"
        ]
    );
}

#[test]
fn numbers_in_titles_sort_by_value() {
    let library = vec![
        game(1, "Hades Vol. 10", 1),
        game(2, "Hades Vol. 2", 1),
        game(3, "Hades", 1),
        game(4, "Madden NFL 2", 1),
        game(5, "Madden NFL 10", 1),
        game(6, "Madden NFL 09", 1),
        game(7, "FIFA 100", 1),
        game(8, "FIFA 19", 1),
        game(9, "Area 51", 1),
        game(10, "Area 5", 1),
        game(11, "007 Legends", 1),
        game(12, "Level 0001", 1),
        game(13, "Level 1 Redux", 1),
    ];
    let report = build(&library, &platforms(), &request(GroupBy::None, &[]), "d");
    assert_eq!(
        titles(&report.sections[0]),
        [
            "007 Legends",
            "Area 5",
            "Area 51",
            "FIFA 19",
            "FIFA 100",
            "Hades",
            "Hades Vol. 2",
            "Hades Vol. 10",
            "Level 0001",
            "Level 1 Redux",
            "Madden NFL 2",
            "Madden NFL 09",
            "Madden NFL 10",
        ]
    );
    // Absurdly long digit runs must not panic or reorder shorter ones.
    let huge = "9".repeat(60);
    assert!(sort_key("x 5") < sort_key(&format!("x {huge}")));
}

#[test]
fn identical_titles_are_stable_by_id() {
    let library = vec![game(9, "Same", 1), game(2, "Same", 2), game(5, "same", 3)];
    let report = build(
        &library,
        &platforms(),
        &request(GroupBy::None, &[Column::Platform]),
        "d",
    );
    let order: Vec<_> = report.sections[0]
        .rows
        .iter()
        .map(|r| r.cells[1].as_str())
        .collect();
    // "Same" < "same" byte-wise, then by id.
    assert_eq!(order, ["Nintendo Switch", "PlayStation 4", "PC"]);
}

#[test]
fn all_games_preset_is_one_alphabetical_list() {
    let mut a = game(1, "Beta", 1);
    a.data.release_date = Some("2020-05-01".into());
    a.data.rating = Some(4);
    a.data.genre = Some("RPG".into());
    a.data.account = Some("Main".into());
    let mut b = game(2, "alpha", 2);
    b.data.release_date = Some("20".into());
    b.data.play_status = "Completed".into();
    b.data.media_type = "Digital".into();
    let c = game(3, "Gamma", 3);
    let report = build(
        &[a, b, c],
        &platforms(),
        &request(GroupBy::None, &ALL_COLUMNS),
        "2026-09-21",
    );
    assert_eq!(report.title, "All Games");
    assert_eq!(report.subtitle, "2026-09-21  ·  3 games");
    assert_eq!(report.sections.len(), 1);
    assert!(report.sections[0].heading.is_none());
    assert_eq!(report.columns, ALL_COLUMNS);
    let rows = &report.sections[0].rows;
    assert_eq!(
        rows[0].cells,
        [
            "alpha",
            "Nintendo Switch",
            "",
            "",
            "Completed",
            "",
            "",
            "Digital"
        ]
    );
    assert_eq!(
        rows[1].cells,
        [
            "Beta",
            "PlayStation 4",
            "2020",
            "RPG",
            "Not Started",
            "★★★★☆",
            "Main",
            "Physical"
        ]
    );
    assert_eq!(rows[2].cells[0], "Gamma");
}

#[test]
fn platform_preset_groups_then_sorts_and_drops_the_platform_column() {
    let library = vec![
        game(1, "Zed", 1),
        game(2, "apple", 1),
        game(3, "Mango", 2),
        game(4, "Banana", 3),
        game(5, "cherry", 3),
        game(6, "Lost", 99),
    ];
    let report = build(
        &library,
        &platforms(),
        &request(GroupBy::Platform, &[Column::Platform, Column::Year]),
        "d",
    );
    assert_eq!(report.title, "Games by Platform");
    assert_eq!(report.columns, [Column::Year]);
    let headings: Vec<_> = report
        .sections
        .iter()
        .map(|s| s.heading.as_deref().unwrap())
        .collect();
    assert_eq!(
        headings,
        ["Nintendo Switch", "PC", "PlayStation 4", "Unknown platform"]
    );
    assert_eq!(titles(&report.sections[1]), ["Banana", "cherry"]);
    assert_eq!(titles(&report.sections[2]), ["apple", "Zed"]);
    assert!(report.subtitle.ends_with("6 games  ·  4 platforms"));
    assert!(
        report
            .sections
            .iter()
            .all(|s| s.rows.iter().all(|r| r.cells.len() == 2))
    );
}

#[test]
fn columns_print_in_a_fixed_order_without_duplicates() {
    let columns = columns_for(&request(
        GroupBy::None,
        &[
            Column::Rating,
            Column::Year,
            Column::Rating,
            Column::Platform,
        ],
    ));
    assert_eq!(columns, [Column::Platform, Column::Year, Column::Rating]);
    assert!(columns_for(&request(GroupBy::None, &[])).is_empty());
}

#[test]
fn every_game_appears_exactly_once() {
    let library = big_library(120);
    for group in [GroupBy::None, GroupBy::Platform] {
        let report = build(&library, &platforms(), &request(group, &[]), "d");
        let mut all: Vec<_> = report
            .sections
            .iter()
            .flat_map(|s| s.rows.iter().map(|r| r.cells[0].clone()))
            .collect();
        all.sort();
        let mut expected: Vec<_> = library.iter().map(|g| g.data.title.clone()).collect();
        expected.sort();
        assert_eq!(all, expected);
    }
}

#[test]
fn long_libraries_paginate_in_order_with_repeated_headers_and_footers() {
    let library = big_library(400);
    let report = build(
        &library,
        &platforms(),
        &request(GroupBy::None, &[Column::Platform, Column::Rating]),
        "d",
    );
    let laid = layout(&report, Paper::Letter, false).unwrap();
    assert!(laid.pages.len() > 3);
    let expected: Vec<_> = report.sections[0]
        .rows
        .iter()
        .map(|r| r.cells[0].clone())
        .collect();
    // Wrapped titles span several lines, so compare the joined text per row.
    let mut joined = first_column(&laid).join(" ");
    for title in &expected {
        let first_word = title.split_whitespace().next().unwrap();
        assert!(joined.contains(first_word));
    }
    joined.clear();
    for (i, page) in texts(&laid).iter().enumerate() {
        assert!(
            page.iter().any(|t| t.5 == "Title" && t.3),
            "page {i} lacks the column header"
        );
        let footer = format!("Page {} of {}", i + 1, laid.pages.len());
        assert!(
            page.iter().any(|t| t.5 == footer),
            "page {i} lacks `{footer}`"
        );
        let body_limit = 792.0 - 50.0;
        for t in page.iter().filter(|t| t.2 == 9.5 && t.4 == 0) {
            assert!(
                t.1 < body_limit,
                "body text below the bottom margin on page {i}"
            );
        }
    }
    // Rows keep reading order across page breaks.
    let keys: Vec<_> = expected.iter().map(|t| sort_key(t)).collect();
    let mut sorted = keys.clone();
    sorted.sort();
    assert_eq!(keys, sorted);
}

#[test]
fn headings_are_never_stranded_at_the_bottom_of_a_page() {
    // Section sizes chosen so that headings land at many different page offsets.
    let mut library = Vec::new();
    let mut id = 0;
    for (platform, count) in [(1, 37), (2, 41), (3, 44)] {
        for n in 0..count {
            id += 1;
            library.push(game(id, &format!("P{platform} title {n:03}"), platform));
        }
    }
    for extra in 0..30 {
        let mut p = platforms();
        p.push(platform(10 + extra, &format!("Extra {extra:02}")));
        for n in 0..(extra % 5 + 1) {
            id += 1;
            library.push(game(id, &format!("E{extra} game {n}"), 10 + extra));
        }
        let report = build(
            &library,
            &p,
            &request(GroupBy::Platform, &[Column::Year]),
            "d",
        );
        let laid = layout(&report, Paper::A4, false).unwrap();
        for (i, page) in texts(&laid).iter().enumerate() {
            for heading in page.iter().filter(|t| t.2 == 12.0 && t.3) {
                let rows_below = page
                    .iter()
                    .filter(|t| t.2 == 9.5 && !t.3 && t.4 == 0 && t.1 > heading.1)
                    .count();
                assert!(
                    rows_below >= 1,
                    "heading `{}` alone at the bottom of page {i}",
                    heading.5
                );
            }
        }
    }
}

#[test]
fn platform_report_has_a_heading_and_bookmark_per_platform() {
    let library = big_library(90);
    let report = build(
        &library,
        &platforms(),
        &request(GroupBy::Platform, &[]),
        "d",
    );
    let laid = layout(&report, Paper::Letter, false).unwrap();
    let names: Vec<_> = laid.outline.iter().map(|o| o.0.as_str()).collect();
    assert_eq!(names, ["Nintendo Switch", "PC", "PlayStation 4"]);
    assert!(laid.outline.iter().all(|o| o.1 < laid.pages.len()));
    let headings: Vec<_> = texts(&laid)
        .into_iter()
        .flatten()
        .filter(|t| t.2 == 12.0 && t.3)
        .map(|t| t.5.to_string())
        .collect();
    assert_eq!(headings, names);
    // "30 games" style counts are printed beside each heading.
    assert!(
        texts(&laid)
            .into_iter()
            .flatten()
            .any(|t| t.5 == "30 games")
    );
}

#[test]
fn nothing_overflows_the_page_even_with_every_column_and_awkward_text() {
    let mut library = big_library(60);
    library[0].data.title = "Supercalifragilisticexpialidocious".repeat(6);
    library[1].data.title = "A very long title with many words that keeps going and going until it must wrap onto several lines".into();
    library[2].data.genre =
        Some("Extraordinarily-hyphenated-genre-name-without-spaces-at-all".into());
    library[3].data.account = Some("someone.with.a.very.long.account.name@example.com".into());
    for (paper, landscape) in [
        (Paper::Letter, false),
        (Paper::A4, false),
        (Paper::Letter, true),
        (Paper::A4, true),
    ] {
        let mut req = request(GroupBy::None, &ALL_COLUMNS);
        req.paper = paper;
        let report = build(&library, &platforms(), &req, "d");
        let laid = layout(&report, paper, landscape).unwrap();
        for page in texts(&laid) {
            for (x, _, size, bold, _, text) in page {
                assert!(
                    x + text_width(text, size, bold) <= laid.width - 42.0 + 0.5,
                    "`{text}` overflows the right margin"
                );
            }
        }
        // The over-long title was broken across lines, not clipped.
        let joined: String = first_column(&laid).concat().replace(' ', "");
        assert!(joined.contains(&"Supercalifragilisticexpialidocious".repeat(6)));
    }
}

#[test]
fn titles_wrap_within_their_column_instead_of_running_into_the_next() {
    let mut library = vec![game(
        1,
        "One two three four five six seven eight nine ten eleven twelve thirteen fourteen",
        1,
    )];
    library[0].data.genre = Some("Genre".into());
    let report = build(
        &library,
        &platforms(),
        &request(GroupBy::None, &[Column::Platform]),
        "d",
    );
    let laid = layout(&report, Paper::Letter, false).unwrap();
    let title_lines = first_column(&laid);
    assert!(title_lines.len() > 1, "expected the long title to wrap");
    // Platform column starts after title column + gap; every title line must end before it.
    let platform_x = texts(&laid)
        .into_iter()
        .flatten()
        .find(|t| t.5 == "PlayStation 4" || t.5 == "PlayStation")
        .unwrap()
        .0;
    for line in title_lines {
        assert!(42.0 + text_width(&line, 9.5, false) <= platform_x - 8.0 + 0.01);
    }
}

#[test]
fn unprintable_characters_are_replaced_and_counted_not_dropped_silently() {
    let library = vec![
        game(1, "ファイナル Fantasy", 1),
        game(2, "Pokémon Ōkami Ⅶ ★ Ærø Łódź", 1),
    ];
    let report = build(&library, &platforms(), &request(GroupBy::None, &[]), "d");
    let laid = layout(&report, Paper::Letter, false).unwrap();
    assert_eq!(laid.unsupported, 5);
    let printed = first_column(&laid).join("|");
    assert!(printed.contains("????? Fantasy"));
    assert!(printed.contains("Pokémon Ōkami Ⅶ ★ Ærø Łódź"));
    assert!(!printed.contains('フ'));
}

#[test]
fn control_characters_and_newlines_become_spaces() {
    let library = vec![game(1, "Line one\nLine two\t\u{7}end", 1)];
    let report = build(&library, &platforms(), &request(GroupBy::None, &[]), "d");
    let laid = layout(&report, Paper::Letter, false).unwrap();
    assert_eq!(laid.unsupported, 0);
    assert_eq!(first_column(&laid), ["Line one Line two end"]);
}

#[test]
fn an_empty_library_still_produces_a_valid_report() {
    for group in [GroupBy::None, GroupBy::Platform] {
        let report = build(&[], &platforms(), &request(group, &[Column::Year]), "d");
        let laid = layout(&report, Paper::A4, false).unwrap();
        assert_eq!(laid.pages.len(), 1);
        assert!(
            texts(&laid)
                .into_iter()
                .flatten()
                .any(|t| t.5 == "There are no games in the library.")
        );
        assert!(
            render(&report, Paper::A4, false)
                .unwrap()
                .bytes
                .starts_with(b"%PDF-")
        );
    }
}

#[test]
fn paper_and_orientation_set_the_page_size() {
    let report = build(
        &big_library(5),
        &platforms(),
        &request(GroupBy::None, &[]),
        "d",
    );
    let size = |paper, landscape| {
        let l = layout(&report, paper, landscape).unwrap();
        (l.width.round(), l.height.round())
    };
    assert_eq!(size(Paper::Letter, false), (612.0, 792.0));
    assert_eq!(size(Paper::Letter, true), (792.0, 612.0));
    assert_eq!(size(Paper::A4, false), (595.0, 842.0));
    assert_eq!(size(Paper::A4, true), (842.0, 595.0));
}

#[test]
fn rendered_pdf_is_well_formed_with_the_expected_pages_and_bookmarks() {
    let library = big_library(250);
    for group in [GroupBy::None, GroupBy::Platform] {
        let report = build(
            &library,
            &platforms(),
            &request(group, &[Column::Platform, Column::Year, Column::Rating]),
            "d",
        );
        let rendered = render(&report, Paper::A4, false).unwrap();
        assert!(rendered.bytes.starts_with(b"%PDF-"));
        assert!(rendered.pages > 2);
        let document = lopdf::Document::load_mem(&rendered.bytes).unwrap();
        assert_eq!(document.get_pages().len(), rendered.pages);
        let catalog = document.catalog().unwrap();
        assert_eq!(catalog.get(b"Outlines").is_ok(), group == GroupBy::Platform);
        // Fonts are embedded (subsetted), so the file stays small.
        assert!(
            rendered.bytes.len() < 400_000,
            "{} bytes",
            rendered.bytes.len()
        );
    }
}

#[test]
fn write_saves_atomically_and_replaces_an_existing_file() {
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("report.pdf");
    std::fs::write(&dest, b"old").unwrap();
    let result = write(
        &big_library(30),
        &platforms(),
        &request(GroupBy::Platform, &[]),
        "d",
        &dest,
    )
    .unwrap();
    assert_eq!(result.games, 30);
    let saved = lopdf::Document::load(&dest).unwrap();
    assert_eq!(saved.get_pages().len(), result.pages);
    assert_eq!(result.unsupported_characters, 0);
    assert!(std::fs::read(&dest).unwrap().starts_with(b"%PDF-"));
    assert!(!dir.path().join("report.pdf.part").exists());

    let missing = dir.path().join("no-such-folder").join("report.pdf");
    assert!(
        write(
            &big_library(3),
            &platforms(),
            &request(GroupBy::None, &[]),
            "d",
            &missing
        )
        .is_err()
    );
    assert!(!dir.path().join("no-such-folder").exists());
}

#[test]
fn requests_deserialize_from_the_frontend_shape() {
    let request: ReportRequest = serde_json::from_str(
        r#"{"group_by":"platform","paper":"a4","landscape":true,"columns":["media_type","year"]}"#,
    )
    .unwrap();
    assert_eq!(request.group_by, GroupBy::Platform);
    assert_eq!(request.paper, Paper::A4);
    assert!(request.landscape);
    assert_eq!(columns_for(&request), [Column::Year, Column::MediaType]);
    assert!(
        serde_json::from_str::<ReportRequest>(
            r#"{"group_by":"genre","paper":"a4","landscape":false,"columns":[]}"#
        )
        .is_err()
    );
    assert!(
        serde_json::from_str::<ReportRequest>(
            r#"{"group_by":"none","paper":"legal","landscape":false,"columns":[]}"#
        )
        .is_err()
    );
}

/// Developer aid: writes realistic sample PDFs for visual inspection.
/// `XPIEDB_REPORT_SAMPLES=/some/dir cargo test sample_reports -- --ignored`
#[test]
#[ignore = "writes files for manual inspection"]
fn sample_reports_for_visual_inspection() {
    let dir = std::env::var("XPIEDB_REPORT_SAMPLES").expect("set XPIEDB_REPORT_SAMPLES");
    let names = [
        "Super Mario Odyssey",
        "The Legend of Zelda: Breath of the Wild",
        "Ōkami HD",
        "Pokémon Legends: Arceus",
        "Final Fantasy Ⅶ Remake Intergrade",
        "1942",
        "Æon Flux",
        "Hades",
        "Celeste",
        "Stardew Valley",
        "Metroid Dread",
        "Bayonetta 2",
        "Fire Emblem: Three Houses",
        "ファイナルファンタジー",
        "Xenoblade Chronicles 3: Future Redeemed Expansion Pass Edition",
    ];
    let statuses = ["Not Started", "Playing", "Completed", "On Hold"];
    let mut library = Vec::new();
    for i in 0..170 {
        let mut g = game(
            i + 1,
            &format!(
                "{} {}",
                names[i as usize % names.len()],
                if i >= 15 {
                    format!("Vol. {}", i / 15 + 1)
                } else {
                    String::new()
                }
            ),
            (i % 3) + 1,
        );
        g.data.release_date = Some(format!("{}-01-01", 1990 + (i * 7) % 34));
        g.data.genre = Some(
            ["Action, Adventure", "RPG", "Platformer, Puzzle", "Strategy"][i as usize % 4].into(),
        );
        g.data.play_status = statuses[i as usize % 4].into();
        g.data.rating = if i % 4 == 0 { None } else { Some(i % 5 + 1) };
        g.data.account = if i % 5 == 0 {
            Some("Main Account".into())
        } else {
            None
        };
        g.data.media_type = if i % 2 == 0 { "Physical" } else { "Digital" }.into();
        library.push(g);
    }
    let cases = [
        (
            "all-games",
            GroupBy::None,
            vec![
                Column::Platform,
                Column::Year,
                Column::Status,
                Column::Rating,
            ],
            false,
        ),
        (
            "by-platform",
            GroupBy::Platform,
            vec![Column::Year, Column::Genre, Column::Status, Column::Rating],
            false,
        ),
        (
            "all-columns-landscape",
            GroupBy::None,
            ALL_COLUMNS.to_vec(),
            true,
        ),
    ];
    for (name, group_by, columns, landscape) in cases {
        let req = ReportRequest {
            group_by,
            paper: Paper::Letter,
            landscape,
            columns,
        };
        let result = write(
            &library,
            &platforms(),
            &req,
            "2026-09-21",
            &Path::new(&dir).join(format!("{name}.pdf")),
        )
        .unwrap();
        println!(
            "{name}: {} pages, {} unsupported",
            result.pages, result.unsupported_characters
        );
    }
}
