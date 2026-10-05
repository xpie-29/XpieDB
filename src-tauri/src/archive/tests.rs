use super::api::*;
use crate::{guide_files, guides, storage, testutil::mock_server};
use ammonia::Url;
use rusqlite::Connection;
use std::{
    fs,
    sync::atomic::{AtomicBool, Ordering},
};

fn run<T>(future: impl std::future::Future<Output = T>) -> T {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(future)
}
fn leak(text: String) -> &'static str {
    Box::leak(text.into_boxed_str())
}
fn w(text: &str) -> Vec<String> {
    words(text)
}

const SEARCH: &str = r#"{"response":{"numFound":5,"docs":[
 {"identifier":"doom-3-novel","title":"Doom 3: The Novel","creator":["Someone"],"year":"2005","format":["Text PDF","EPUB"],"downloads":900},
 {"identifier":"doom-3-official-strategy-guide","title":"Doom 3 Official Strategy Guide","creator":"BradyGames","year":2004,"format":["Text PDF","Image Container PDF"],"collection":["manuals"],"downloads":120},
 {"identifier":"doom3-lending","title":"Doom 3 Prima Guide","format":["LCP Encrypted EPUB","Metadata"],"access-restricted-item":"true","collection":["inlibrary","printdisabled"],"downloads":5000},
 {"identifier":"BAD ID with spaces","title":"Doom 3 Guide","format":["Text PDF"]},
 {"identifier":"doom-3-maps","title":"Doom 3 Level Maps","format":["PDF"],"downloads":10}
]}}"#;

#[test]
fn search_words_are_made_safe_for_the_query_language() {
    assert_eq!(w("Doom 3"), ["doom", "3"]);
    assert_eq!(
        w("\"Doom 3\": (the) OR -secret* [x] {y} ^z ~q \\ /"),
        ["doom", "3", "the", "or", "secret", "x", "y", "z"]
    );
    assert_eq!(w("Baldur's Gate"), ["baldur's", "gate"]);
    assert_eq!(w("  ...  "), Vec::<String>::new());
    assert_eq!(w("a b c d e f g h i j k").len(), 8);
    assert_eq!(w("Pokémon Rojo"), ["pokémon", "rojo"]);
}

#[test]
fn results_are_ranked_guides_first_and_borrow_only_last_and_bad_ids_dropped() {
    let (base, server) = mock_server(vec![(200, SEARCH)]);
    let found = run(ArchiveClient::for_test(base).search("doom 3")).unwrap();
    assert!(!found.broadened);
    let order: Vec<_> = found.hits.iter().map(|h| h.identifier.as_str()).collect();
    // The strategy guide beats a novel with the same words; the lending item is demoted; the bad id is gone.
    assert_eq!(order[0], "doom-3-official-strategy-guide");
    assert_eq!(order.last(), Some(&"doom3-lending"));
    assert!(!order.contains(&"BAD ID with spaces"));
    assert_eq!(order.len(), 4);
    let guide = &found.hits[0];
    assert!(guide.has_pdf && !guide.has_epub && !guide.borrow_only);
    assert_eq!(guide.creator.as_deref(), Some("BradyGames"));
    assert_eq!(guide.year.as_deref(), Some("2004"));
    let lending = found
        .hits
        .iter()
        .find(|h| h.identifier == "doom3-lending")
        .unwrap();
    assert!(
        lending.borrow_only && !lending.has_epub,
        "an encrypted epub is not a readable one"
    );
    let novel = found
        .hits
        .iter()
        .find(|h| h.identifier == "doom-3-novel")
        .unwrap();
    assert!(novel.has_pdf && novel.has_epub);
    // The request asks for the title first, only texts, with the fields we need.
    let request = &server.join().unwrap()[0];
    assert!(request.starts_with("GET /advancedsearch.php?"));
    assert!(
        request.contains("q=title%3A%28doom+AND+3%29+AND+mediatype%3Atexts"),
        "{request}"
    );
    assert!(request.contains("output=json"));
    assert!(
        request.to_lowercase().contains("user-agent: xpiedb/"),
        "{request}"
    );
}

#[test]
fn an_empty_title_search_is_widened_once() {
    let (base, server) = mock_server(vec![(200, r#"{"response":{"docs":[]}}"#), (200, SEARCH)]);
    let found = run(ArchiveClient::for_test(base).search("doom 3")).unwrap();
    assert!(found.broadened);
    assert_eq!(found.hits.len(), 4);
    let requests = server.join().unwrap();
    assert!(requests[0].contains("title%3A"));
    assert!(!requests[1].contains("title%3A"), "{}", requests[1]);
    assert!(requests[1].contains("q=%28doom+AND+3%29+AND+mediatype%3Atexts"));
}

#[test]
fn nothing_found_and_empty_queries_are_reported_plainly() {
    let (base, _s) = mock_server(vec![
        (200, r#"{"response":{"docs":[]}}"#),
        (200, r#"{"response":{"docs":[]}}"#),
    ]);
    let found = run(ArchiveClient::for_test(base).search("zzzz")).unwrap();
    assert!(found.hits.is_empty() && found.broadened);
    let (base, _s) = mock_server(vec![]);
    assert!(
        run(ArchiveClient::for_test(base).search("  !!  "))
            .unwrap_err()
            .contains("Enter a game")
    );
}

#[test]
fn errors_are_friendly_and_do_not_leak_details() {
    for (status, needle) in [
        (429, "slow down"),
        (503, "trouble"),
        (404, "no longer"),
        (418, "unexpected"),
    ] {
        let (base, _s) = mock_server(vec![(status, "{}")]);
        let error = run(ArchiveClient::for_test(base).search("doom")).unwrap_err();
        assert!(error.contains(needle), "{status}: {error}");
        assert!(!error.contains("127.0.0.1"));
    }
    let (base, _s) = mock_server(vec![(200, "not json")]);
    assert!(
        run(ArchiveClient::for_test(base).search("doom"))
            .unwrap_err()
            .contains("unexpected")
    );
    // Nothing is listening: a network failure reads as such.
    let error =
        run(ArchiveClient::for_test("http://127.0.0.1:1".into()).search("doom")).unwrap_err();
    assert!(error.contains("Unable to reach"));
}

const ITEM: &str = r#"{"metadata":{"title":"Doom 3 Official Strategy Guide"},"files":[
 {"name":"doom.pdf","format":"Text PDF","size":"2000000"},
 {"name":"doom_bw.pdf","format":"Image Container PDF","size":"90000000"},
 {"name":"doom_text.pdf","format":"Additional Text PDF","size":"3000000"},
 {"name":"doom.epub","format":"EPUB","size":"500000"},
 {"name":"doom_lcp.epub","format":"LCP Encrypted EPUB","size":"500000"},
 {"name":"doom_djvu.xml","format":"Djvu XML","size":"100"},
 {"name":"doom_jp2.zip","format":"Single Page Processed JP2 ZIP","size":"900"},
 {"name":"../escape.pdf","format":"PDF","size":"1"},
 {"name":"sub/dir.pdf","format":"PDF","size":"1"},
 {"name":".hidden.pdf","format":"PDF","size":"1"},
 {"name":"upload.PDF","format":"PDF","size":1234},
 {"name":"huge.pdf","format":"Text PDF","size":"2000000000"}
]}"#;

#[test]
fn only_readable_whole_book_files_are_offered_best_first() {
    let (base, server) = mock_server(vec![(200, ITEM)]);
    let item =
        run(ArchiveClient::for_test(base)
            .item("doom-3-official-strategy-guide", 1024 * 1024 * 1024))
        .unwrap();
    assert_eq!(item.title, "Doom 3 Official Strategy Guide");
    assert!(!item.borrow_only);
    let names: Vec<_> = item.files.iter().map(|f| f.name.as_str()).collect();
    // Searchable text first (smaller first), then ePub, then scans, then other PDFs.
    assert_eq!(
        names,
        [
            "doom.pdf",
            "doom_text.pdf",
            "huge.pdf",
            "doom.epub",
            "doom_bw.pdf",
            "upload.PDF"
        ]
    );
    assert_eq!(item.files[0].detail, "Searchable text");
    assert_eq!(item.files[4].detail, "Scanned pages");
    assert_eq!(item.files[3].kind, "epub");
    assert_eq!(item.files[5].size_bytes, 1234);
    assert!(item.files[2].too_large && !item.files[0].too_large);
    assert!(server.join().unwrap()[0].starts_with("GET /metadata/doom-3-official-strategy-guide "));
}

#[test]
fn a_restricted_item_is_marked_borrow_only() {
    let body = r#"{"metadata":{"title":"Lent","access-restricted-item":"true"},"files":[{"name":"x.pdf","format":"Text PDF","size":"10"}]}"#;
    let (base, _s) = mock_server(vec![(200, body)]);
    assert!(
        run(ArchiveClient::for_test(base).item("lent-book", 1 << 30))
            .unwrap()
            .borrow_only
    );
    let (base, _s) = mock_server(vec![(200, "{}")]);
    assert!(
        run(ArchiveClient::for_test(base).item("gone", 1 << 30))
            .unwrap_err()
            .contains("no longer")
    );
    let (base, _s) = mock_server(vec![]);
    for bad in ["", "a b", "../x", "x/y", ".hidden", &"a".repeat(201)] {
        assert!(
            run(ArchiveClient::for_test(base.clone()).item(bad, 1 << 30)).is_err(),
            "{bad}"
        );
    }
}

#[test]
fn identifiers_pages_and_redirects_are_checked() {
    assert!(valid_identifier("doom-3_guide.v2"));
    assert!(!valid_identifier("Doom 3") && !valid_identifier("a/b") && !valid_identifier(""));
    assert_eq!(
        details_url("doom-3").unwrap(),
        "https://archive.org/details/doom-3"
    );
    assert!(details_url("../etc").is_err());
    for (url, ok) in [
        ("https://archive.org/download/x/y.pdf", true),
        ("https://ia800000.us.archive.org/1/items/x/y.pdf", true),
        ("https://evilarchive.org/x", false),
        ("https://archive.org.evil.com/x", false),
        ("http://archive.org/x", false),
        ("https://example.com/x", false),
    ] {
        assert_eq!(allowed_redirect(&Url::parse(url).unwrap()), ok, "{url}");
    }
}

#[test]
fn a_download_is_written_with_progress_and_the_name_is_encoded() {
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("out.part");
    let (base, server) = mock_server(vec![(200, "%PDF-1.4 hello world")]);
    let cancel = AtomicBool::new(false);
    let mut seen = Vec::new();
    let written = run(ArchiveClient::for_test(base).download(
        "item-1",
        "Strategy Guide (v2).pdf",
        &dest,
        1 << 20,
        &cancel,
        |got, total| seen.push((got, total)),
    ))
    .unwrap();
    assert_eq!(written, 20);
    assert_eq!(fs::read(&dest).unwrap(), b"%PDF-1.4 hello world");
    assert_eq!(seen.last(), Some(&(20, Some(20))));
    let request = &server.join().unwrap()[0];
    assert!(
        request.starts_with("GET /download/item-1/Strategy%20Guide%20(v2).pdf "),
        "{request}"
    );
}

#[test]
fn borrow_only_missing_cancelled_and_oversized_downloads_leave_nothing_behind() {
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("out.part");
    let cancel = AtomicBool::new(false);
    for (status, needle) in [
        (401, "borrow-only"),
        (403, "borrow-only"),
        (404, "no longer"),
    ] {
        let (base, _s) = mock_server(vec![(status, "{}")]);
        let error = run(ArchiveClient::for_test(base).download(
            "i",
            "f.pdf",
            &dest,
            1 << 20,
            &cancel,
            |_, _| {},
        ))
        .unwrap_err();
        assert!(error.contains(needle), "{status}: {error}");
        assert!(!dest.exists());
    }
    // Cancelled before the first chunk is handled.
    let (base, _s) = mock_server(vec![(200, "%PDF-1.4 hello world")]);
    cancel.store(true, Ordering::Relaxed);
    let error = run(ArchiveClient::for_test(base).download(
        "i",
        "f.pdf",
        &dest,
        1 << 20,
        &cancel,
        |_, _| {},
    ))
    .unwrap_err();
    assert_eq!(error, "Download cancelled.");
    assert!(!dest.exists());
    cancel.store(false, Ordering::Relaxed);
    // Larger than the limit, by its declared length.
    let (base, _s) = mock_server(vec![(200, "%PDF-1.4 hello world")]);
    let error =
        run(ArchiveClient::for_test(base).download("i", "f.pdf", &dest, 10, &cancel, |_, _| {}))
            .unwrap_err();
    assert!(error.contains("larger than"), "{error}");
    assert!(!dest.exists());
    // An invalid item id never reaches the network.
    let (base, _s) = mock_server(vec![]);
    assert!(
        run(ArchiveClient::for_test(base).download("../x", "f.pdf", &dest, 10, &cancel, |_, _| {}))
            .is_err()
    );
}

fn library() -> (tempfile::TempDir, Connection, i64) {
    let dir = tempfile::tempdir().unwrap();
    let c = Connection::open(dir.path().join("test.db")).unwrap();
    c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    storage::run_migrations(&c).unwrap();
    let guide = guides::save_guide(
        &c,
        None,
        guides::GuideInput {
            title: "Guide".into(),
            has_physical: false,
            ..Default::default()
        },
    )
    .unwrap()
    .id;
    (dir, c, guide)
}

#[test]
fn a_downloaded_file_is_checked_then_moved_into_the_guide() {
    let (dir, c, guide) = library();
    let temp = dir.path().join(".archive-x.part");
    fs::write(&temp, b"%PDF-1.4\nbody\n%%EOF").unwrap();
    let file = guide_files::attach_downloaded(
        &c,
        dir.path(),
        guide,
        &temp,
        "Doom 3 Guide.pdf",
        Some("https://archive.org/details/doom"),
        guide_files::MAX_BYTES,
    )
    .unwrap();
    assert_eq!(file.kind, "pdf");
    assert_eq!(file.file_name, "Doom 3 Guide.pdf");
    assert_eq!(
        file.source_url.as_deref(),
        Some("https://archive.org/details/doom")
    );
    // Moved, not copied: the temporary file is gone and exactly one copy is stored.
    assert!(!temp.exists());
    assert_eq!(
        fs::read_dir(dir.path().join(guide_files::DIR))
            .unwrap()
            .count(),
        1
    );
}

#[test]
fn a_downloaded_file_that_is_not_a_book_is_refused_and_removed() {
    let (dir, c, guide) = library();
    let temp = dir.path().join(".archive-y.part");
    fs::write(&temp, "<html>Error page saved as a download</html>").unwrap();
    let error = guide_files::attach_downloaded(
        &c,
        dir.path(),
        guide,
        &temp,
        "x.pdf",
        None,
        guide_files::MAX_BYTES,
    )
    .unwrap_err();
    assert!(error.contains("PDF or ePub"), "{error}");
    assert!(!temp.exists());
    assert!(
        guide_files::all_by_guide(&c, dir.path())
            .unwrap()
            .is_empty()
    );
    // A duplicate download is refused and its temporary file removed too.
    let first = dir.path().join(".archive-1.part");
    fs::write(&first, b"%PDF-1.4 same").unwrap();
    guide_files::attach_downloaded(
        &c,
        dir.path(),
        guide,
        &first,
        "a.pdf",
        None,
        guide_files::MAX_BYTES,
    )
    .unwrap();
    let again = dir.path().join(".archive-2.part");
    fs::write(&again, b"%PDF-1.4 same").unwrap();
    assert!(
        guide_files::attach_downloaded(
            &c,
            dir.path(),
            guide,
            &again,
            "b.pdf",
            None,
            guide_files::MAX_BYTES
        )
        .unwrap_err()
        .contains("already attached")
    );
    assert!(!again.exists());
    let _ = leak(String::new());
}

/// Opt-in check against the real service: `cargo test live_archive -- --ignored --nocapture`.
#[test]
#[ignore = "talks to the real Internet Archive"]
fn live_archive_search_item_and_download() {
    let client = ArchiveClient::new().unwrap();
    let found = run(client.search("final fantasy vii strategy guide")).unwrap();
    println!("broadened={} hits={}", found.broadened, found.hits.len());
    for hit in found.hits.iter().take(8) {
        println!(
            "{:>4} {:<45} pdf={} epub={} borrow={} dl={} {}",
            hit.score,
            hit.identifier,
            hit.has_pdf,
            hit.has_epub,
            hit.borrow_only,
            hit.downloads,
            hit.title
        );
    }
    assert!(!found.hits.is_empty());
    let open = found
        .hits
        .iter()
        .find(|h| !h.borrow_only && h.has_pdf)
        .expect("an open PDF item");
    let item = run(client.item(&open.identifier, 1 << 30)).unwrap();
    println!("item {} borrow_only={}", item.identifier, item.borrow_only);
    for file in &item.files {
        println!(
            "  {:<50} {} {:<16} {} too_large={}",
            file.name, file.kind, file.detail, file.size_bytes, file.too_large
        );
    }
    let lent = found.hits.iter().find(|h| h.borrow_only);
    if let Some(lent) = lent {
        let item = run(client.item(&lent.identifier, 1 << 30)).unwrap();
        println!(
            "lending item {} borrow_only={} files={}",
            item.identifier,
            item.borrow_only,
            item.files.len()
        );
    }
    // Download the smallest listed file (limited to 3 MB) to prove the redirect and streaming work.
    if let Some(small) = item
        .files
        .iter()
        .filter(|f| f.size_bytes > 0 && f.size_bytes < 3_000_000)
        .min_by_key(|f| f.size_bytes)
    {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("x.part");
        let cancel = AtomicBool::new(false);
        let mut last = 0;
        let written = run(client.download(
            &open.identifier,
            &small.name,
            &dest,
            3_000_000,
            &cancel,
            |got, _| last = got,
        ))
        .unwrap();
        println!(
            "downloaded {} bytes ({}), progress ended at {}",
            written, small.name, last
        );
        let mut file = fs::File::open(&dest).unwrap();
        println!(
            "kind detected: {:?}",
            crate::guide_files::detect_kind(&mut file).unwrap()
        );
    } else {
        println!("no file under 3 MB to download in this item");
    }
}
