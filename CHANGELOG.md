# Changelog

## Milestone 7 - 2026-09-21

- Added a collapsible Statistics ribbon under the Library search: summary tiles, games by
  platform, games by play status, and tabbed genre, release decade, rating, added-per-year and
  developer breakdowns.
- Statistics follow the Library's search and filters; open/closed state is remembered
  (`stats_open` preference). Charts have tooltips (hover and keyboard focus) and table views.

## Milestone 6 - 2026-09-21

- Added Reports: PDF output for "All games, alphabetical" and "Games by platform",
  with selectable columns, paper size, and orientation (paper and orientation remembered).
- One report engine (model, pagination, PDF writer) behind both presets; new groupings
  only need to extend the model builder.
- PDFs have repeating column headers, page numbers, platform bookmarks, and selectable
  text. Numbers in titles sort by value; accents and case are ignored.
- Bundled DejaVu Sans (license included). Unprintable characters (CJK) show as `?` and
  are reported. Added the `krilla`, `ttf-parser`, and `unicode-normalization` crates.

## Milestone 5 - 2026-09-21

- Added backup and restore (Settings): one portable `.zip` with the database snapshot,
  covers, custom platform icons, and a manifest. Credentials are never included.
- Restore validates the archive first, backs up the current library automatically,
  then swaps it in with rollback on failure. Hostile or damaged archives are rejected.
- Commands: `backup_create`, `backup_choose_restore`, `backup_restore`,
  `backup_cancel_restore`. Added the `zip` crate (deflate only).
- Rebuilt on the macOS branch: no earlier implementation had been committed.

## macOS port - 2026-09-21

- Added macOS support alongside Windows; the app is now cross-platform.
- Renamed the product from GameVault to XpieDB: bundle identifier
  `com.xpiedb.desktop`, crate `xpiedb`, database `xpiedb.db`, and the credential
  service. **Existing Windows libraries under `%APPDATA%\com.gamevault.desktop`
  and saved IGDB credentials are not migrated automatically.** Dated verification
  reports under `docs/` keep the original GameVault names.
- Credential storage is selected per platform in `src-tauri/src/igdb/store.rs`
  (Windows Credential Manager, macOS login Keychain).
- macOS bundle targets (`.app`, `.dmg`) live in `src-tauri/tauri.macos.conf.json`.
- Library search shortcut is Cmd+F on macOS.

## Milestone 4 - 2026-09-15

- Added optional Rust-owned IGDB search, platform selection, and editable metadata review.
- Added Windows Credential Manager storage and in-memory Twitch token renewal/retry.
- Added local managed-cover downloads with nonfatal image failure and review cleanup.
- Preserved local ownership and source IGDB IDs, with intentional duplicate-copy warnings.
- Kept manual entry and local Library operations independent of IGDB availability.
- Added mocked Rust/browser tests and Windows cross-process credential persistence checks.
- Verified live release credential save/restart and IGDB functionality with the user.
- Retained the existing schema and dependency versions; added focused HTTP/keyring
  dependencies and development-only Playwright coverage. No metadata refresh or sync.

## Milestone 3 - 2026-09-15

- Added a dedicated Library utility bar with immediate local structured-field search.
- Added Platform, Account, Play Status, Genre, Tag, and Media Type filters with AND semantics.
- Added nine persistent sort orders and Clear All Filters that preserves presentation settings.
- Kept inspector selection synchronized with results and distinguished no results from an empty library.
- Added Ctrl+F search focus, active-filter feedback, result counts, and 40 query regression tests.
- Retained the existing shell, database schema, notes, covers, and dependency versions.

## Milestone 2.5 - 2026-09-15

- Replaced the left rail with a compact primary toolbar and right-side presentation controls.
- Added shared Grid/List selection and a fixed independently scrolling detail inspector.
- Added nullable free-text Account through transactional migration 3, preserving old records.
- Added reusable accessible stars with hover, keyboard operation, clearing, and read-only display.
- Removed platform-mark frames and normalized compact alignment without external assets.
- Preserved editing, notes, covers, tags, and preferences; added Account migration/regression tests.
- Prepared an optional utility-bar slot without adding search, filtering, Stats, or IGDB.

## Milestone 2 - 2026-09-15

- Added transactional local-library schema with games, platforms, tags, and preferences.
- Added offline manual CRUD, dedicated detail view, and explicit edit cancellation.
- Added Cover Grid, Compact List, and four persistent cover sizes.
- Seeded 20 built-in platforms and added custom platform/icon management.
- Added Tiptap rich-text notes, Rust HTML sanitization, and safe external hyperlinks.
- Added validated managed JPEG/PNG/WebP imports and reference-aware image cleanup.
- Added temporary-database tests for migrations, CRUD, relationships, notes, preferences, and images.

## 0.1.0 - 2026-09-15

- Scaffolded the XpieDB Tauri 2, React, TypeScript, Vite, and Fluent UI foundation.
- Added Rust application-data directory handling.
- Added SQLite setup with a migration mechanism using bundled `rusqlite`.
- Added a basic dark Windows-style application shell for the Library, Add Game, and Settings destinations.
- Added required application icon assets for Windows compilation and packaging.
- Added a migration regression test for repeatable setup and data preservation.
- Expanded local-data and credential ignore rules and wrapped long sidebar paths.
