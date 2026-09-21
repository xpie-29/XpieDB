# Milestone 6 Verification

PDF reports, verified on macOS (Apple Silicon) on 2026-09-21 on the `macos-port` branch.
The earlier Windows implementation was never committed, so this is a new implementation
of the same two reports on a general engine. CSV/JSON export was not part of this milestone.

## Design

- `ReportRequest { group_by, paper, landscape, columns }` -> `build` (model) ->
  `layout` (per-page drawing operations) -> `render` (PDF via `krilla`).
- Layout is computed before rendering, so pagination is tested without a PDF and every
  footer knows the final page count.
- Rust owns the save dialog and file; the file is written as `.part` and renamed.
- Sorting: accents and case ignored, whitespace collapsed, digit runs compared by value.
  Platforms sort by name. The Library's own Title sort is unchanged and compares numbers as text.
- Font: DejaVu Sans Regular and Bold are embedded in the app (about 1.4 MB) and subset
  into each PDF (about 40 KB for 170 games). No CJK coverage: such characters print as `?`
  and are counted in the result shown to the user.
- Paper and orientation persist through the existing preferences table
  (`report_paper`, `report_orientation`; no schema migration).

## Automated results

- `cargo test --locked`: 55 passed, 3 ignored (two native credential-store tests and a
  developer aid that writes sample PDFs). 21 new tests cover:
  - both presets, fixed column order, dropping Platform when grouped by it, unknown platforms,
    every game appearing exactly once;
  - accent/case/whitespace-insensitive and numeric-aware ordering, stable ties;
  - pagination over 400 games: order, repeated headers, "Page X of Y", nothing below the
    bottom margin; headings never stranded at a page bottom across 30 varied layouts;
  - text never overflowing the right margin for every paper/orientation with all columns
    and awkward text (300-character words, long hyphenated genres, long account names);
    long titles wrapping within their own column;
  - unsupported characters replaced and counted; control characters and newlines become spaces;
  - an empty library still yields a valid one-page PDF;
  - the PDF parses (`lopdf`) with the expected page count and bookmarks, and stays small;
  - atomic save, overwrite, and no `.part` left after a failure;
  - request deserialization and rejection of unknown groupings or paper sizes;
  - preference validation for the two new keys.
- `npm run test:ui`: 28 passed (10 new): presets and defaults, request payload, hidden
  platform column, persisted paper/orientation, cancelled dialog, errors, unprintable-character
  warning, empty library, and controls locked while creating.
- `npm test` (47), `npm run build`, `cargo fmt --check`, `cargo clippy --all-targets -D warnings`
  pass, and the dev app starts.

## Visual and text verification

Sample reports (170 games, mixed accents, long titles, three platforms, portrait and landscape
with all seven columns) were rendered with macOS PDFKit and inspected page by page, and their
text was extracted. Confirmed: hierarchy and alignment, shaded rows following wrapped rows,
platform headings mid-page with rows beneath, repeated column headers, footers, correct
numeric ordering, accents and `Ⅶ` and stars extracting correctly, the document title, and 3
platform bookmarks. This found and fixed two issues the assertions did not: numbers sorting as
text ("Vol. 10" before "Vol. 2") and shading extending past the rules.

## Not verified

- The native save dialog and the real command path were not driven by automation. The Rust
  tests exercise the same `write` function the command calls; the UI tests mock IPC.
- Viewers other than PDFKit (Preview is PDFKit-based; Acrobat, browsers, phone and e-reader
  viewers) were not tried. The output is standard PDF with embedded subset fonts.
- Windows was not tested. There is no platform-specific code in this feature.
- Very large libraries were not timed; layout is linear in the number of games.

## Not included

CSV/JSON export, filtering a report to the current Library search, cover images in reports,
letter dividers between alphabet sections, and other groupings (genre, status, account, year).
