# XpieDB

XpieDB is a cross-platform (Windows and macOS) desktop application for cataloging a personal video game collection.

The project principle is simple: a durable local library where the user owns the data. XpieDB does not require an account, subscription, cloud storage, or a server.

## Technology

- Tauri 2
- Rust
- React
- TypeScript
- Vite
- Microsoft Fluent UI React v9
- SQLite through `rusqlite` with bundled SQLite

## Architecture

```text
React + TypeScript + Fluent UI
             |
             v
        Tauri IPC
             |
             v
            Rust
             |
       +-----+-----+
       v           v
     SQLite    Local files
```

Rust owns persistence and application-managed file paths. The frontend calls narrow Tauri commands for local data operations.

## Development

Prerequisites (all platforms):

- Node.js 22.18+ and npm (frontend tests use built-in TypeScript type stripping)
- Rust stable (1.88 or newer)

Windows:

- Windows 10 or newer
- Microsoft Visual Studio 2022 Build Tools with MSVC
- WebView2
- Rust stable MSVC toolchain

macOS:

- macOS 12 or newer
- Xcode Command Line Tools (`xcode-select --install`)

Install dependencies:

```bash
npm install
```

Run the desktop app in development mode:

```bash
npm run tauri dev
```

Build the production app. Windows produces an NSIS installer; macOS produces
`XpieDB.app` and a `.dmg` under `src-tauri/target/release/bundle/`:

```bash
npm run tauri build
```

Platform-specific Tauri settings live in `src-tauri/tauri.macos.conf.json`, which
Tauri merges over `tauri.conf.json` on macOS.

## Application Data

XpieDB uses Tauri's application data directory rather than hardcoded user paths.

The current application identifier resolves this to:

- Windows: `%APPDATA%\com.xpiedb.desktop`
- macOS: `~/Library/Application Support/com.xpiedb.desktop`

The database is `xpiedb.db`, with `covers` and `backups` directories alongside it.

The foundation currently prepares:

```text
XpieDB/
├── xpiedb.db
├── covers/
└── backups/
```

The SQLite database is a normal portable SQLite database. Personal databases, covers, backups, logs, and secrets are ignored by Git.

## Database

Migration 1 establishes migration bookkeeping and `app_meta`. Migration 2 adds
`platforms`, `games`, `tags`, `game_tags`, and `preferences`, plus 20 built-in
platforms. Each migration applies its SQL and completion record within one
transaction. Migration 3 adds nullable free-text `games.account`; migration 4 adds nullable `games.backlog_position`; existing games
retain their data with Account unset. Failed migrations roll back both schema
changes and bookkeeping.

`rusqlite` is configured with the `bundled` feature so XpieDB does not depend on a separate SQLite installation.

## Backup And Restore

Settings > Backup and restore creates and restores a single `.zip` file holding the
whole collection. It works on Windows and macOS, and a backup made on one opens on the other.

- **Contents:** `manifest.json` (format, app and schema versions, counts), a consistent
  snapshot of the SQLite database (`VACUUM INTO`, safe while the app is open), and every
  cover and custom platform icon the catalog references. Unreferenced leftover images
  are not included. IGDB credentials are never included; they stay in the OS credential store.
- **Back up:** a native save dialog picks the destination. The archive is written beside
  it as `.part` and renamed into place, so a failed backup never leaves a truncated file.
- **Restore:** a native open dialog picks the file, which is fully validated before the
  confirmation appears. Only the manifest, `xpiedb.db`, and `covers/` or `platform-icons/`
  files with managed names are accepted, so path traversal and unexpected content are
  rejected. Sizes are enforced while extracting, images must match their extension, and
  the database must pass `PRAGMA integrity_check` and a foreign-key check. Older schemas
  are migrated forward; a backup from a newer XpieDB is refused.
- **Safety net:** after validation and before anything is replaced, the current library
  is backed up automatically to `backups/xpiedb-pre-restore-<timestamp>.zip`. The swap is
  a short series of renames that is rolled back if any step fails, so a failed restore
  keeps the previous library. Safety backups are kept until you delete them.
- A referenced image missing from the library at backup time is reported, not fatal;
  it shows the placeholder, as it always has.

See [Milestone 5 verification](docs/milestone-5-verification.md) for the test evidence
and remaining manual checks.

## Backlog

**Backlog** is a play status. Games with it appear on the **Backlog** page as a numbered list
in an order you set by hand (1 is next up). It is separate from **Not Started**: Not Started
means owned with no plan, Backlog means queued to play.

- **Membership follows status.** Setting a game's status to Backlog (in the game form, the
  IGDB import, or **Add games...** on the Backlog page) puts it at the bottom of the list.
  Changing the status to anything else removes it and the numbers close up. Deleting a game
  does the same.
- **Reordering:** drag the handle (the list rearranges live as you drag), or focus the handle
  and press Up/Down (Home/End for the top and bottom), or use **Move to top**. Each change
  is saved immediately.
- **Row actions:** Move to top, **Start playing** (status becomes Playing), Edit (returns to the
  Backlog afterward), and Remove (status becomes Not Started).
- **Add games...** opens a searchable list of games not in the backlog; tick several and they are
  added to the bottom in the order you tick them.
- **Saved with the library:** the order is stored in the database (`games.backlog_position`,
  migration 4), so backups and restores keep it. Backups from before this version restore normally.
- The game inspector shows "Backlog position", the Library's Play Status filter includes Backlog,
  and Reports has a **Backlog, in order** preset that prints only these games, numbered, in your order.

Rust enforces one rule: a game has a position exactly when its status is Backlog, and positions
are 1, 2, 3 with no gaps. Saving a new order must list exactly the games currently in the
backlog, so a stale screen cannot drop or duplicate entries. Databases that break the rule
(edited or foreign files) are repaired when the app starts and when a backup is restored.
See [Milestone 8 verification](docs/milestone-8-verification.md).

## Statistics

A collapsible **Statistics** ribbon sits under the Library search bar. Collapsed, it is one
line ("60 games · 40% completed · 8 platforms · 3.0 average rating"); expanded, it shows:

- **Tiles:** total games, completed % and count, backlog (games with the Backlog status, with the Not Started count beneath), average rating
  (rated games only) with how many are rated, platforms in use, and the physical/digital split.
- **Games by platform:** share of the collection per platform, top five plus an "Other" row.
- **Games by play status:** one stacked bar (six statuses) with a legend of counts and shares.
- **More breakdowns** (tabs): genre, release decade, rating distribution, games added per
  year, and developer.

The ribbon follows the Library's search and filters, so filtering to one platform, genre or
account shows statistics for just those games (with "N of M" so the scope is clear). Every
chart has hover/keyboard-focus readouts and a table view, and the open/closed state is
remembered. It is hidden while the library is empty.

Notes: a game with several genres or developers counts once in each, so those shares can
add to more than 100%. Statistics are computed in the app from the loaded games
(`src/stats.ts`); nothing is stored or sent anywhere. Chart colors are the validated dark
categorical palette checked against the ribbon surface. See
[Milestone 7 verification](docs/milestone-7-verification.md).

## Reports

Reports (toolbar) create a PDF of the library to read or print away from the computer.
Two presets are built on one report engine:

- **All games, alphabetical:** a single list sorted by title.
- **Backlog, in order:** only games with the Backlog status, numbered in your manual order.
- **Games by platform:** grouped by platform (sorted by name), each platform's games sorted
  by title. The PDF gets a bookmark per platform, and platform headings stay with their first rows.

Choose the columns after the title (platform, release year, genre, play status, rating as
stars, account, media type), the paper size (US Letter or A4, chosen by locale until you pick)
and orientation. Paper and orientation are remembered. A native save dialog picks the file.

- Titles sort case- and accent-insensitively with numbers compared by value, so
  "Hades Vol. 2" comes before "Hades Vol. 10". This differs slightly from the Library's
  Title A-Z sort, which compares numbers as text.
- Long titles wrap inside their column; the column headers repeat on every page; each
  page footer reads "Page X of Y". Text in the PDF is selectable and searchable.
- PDFs use a bundled font (DejaVu Sans, see `src-tauri/assets/fonts/LICENSE-DejaVu.txt`)
  that covers Latin, Greek and Cyrillic scripts, accents and symbols such as roman numerals.
  Japanese, Chinese and Korean text cannot be printed; those characters appear as `?` and
  the app says how many were affected.
- Code: `src-tauri/src/report/` (`mod.rs` builds the model, `layout.rs` paginates and writes
  the PDF with the `krilla` crate). Adding a grouping or sort means extending `build`.

See [Milestone 6 verification](docs/milestone-6-verification.md).

## Help And About

The **Help** menu has **About XpieDB** and **XpieDB on GitHub**. About shows the version, states
that XpieDB was created by Xpie, ChatGPT, and Claude, links to the repository
(https://github.com/xpie-29/GameVault, opened in the default browser), and credits IGDB and the
DejaVu Sans font. On macOS the standard application-menu About opens the same dialog. The
menu is Tauri's default menu (so Edit, Window and the rest keep their normal behavior) with the
Help items added in `src-tauri/src/menu.rs`; the dialog is `src/components/About.tsx`. The
repository URL lives in one place, `REPOSITORY_URL` in `menu.rs`. The repository is still
named GameVault; update that constant if it is renamed.

## IGDB

IGDB is optional: Add Game offers Search IGDB or Enter Manually. Search, choose a
game/platform, review and personalize metadata, then save locally. Imported covers
are managed local files; saved records never require IGDB for browsing or editing.
Likely duplicates are warnings with an intentional additional-copy option.

Configure Twitch Client ID and Client Secret directly in Settings. Rust stores
both in the OS credential store (Windows Credential Manager, or the macOS login
Keychain) and keeps access tokens only in memory. Saved
secrets are never returned to React, logged, or stored in the catalog database.
The release service is `com.xpiedb.desktop.twitch` (user `igdb`). Normal dev
uses the same identity; an isolated `com.xpiedb.verification` configuration
has separate data and credentials. Restart tests must use the same identity.

No metadata refresh or synchronization is implemented, and bulk refresh is deliberately not
planned because it could overwrite personal edits. Local edits remain
authoritative. See [Milestone 4 verification](docs/milestone-4-verification.md)
for mappings, release-date rules, security decisions, and test results.

## Foundation Checks

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
npm run build
npm test
npm run test:ui
npm audit --audit-level=moderate
npm run tauri dev
npm run tauri build
```

The migration test checks repeated initialization and preservation of existing data.
The Windows release executable is `src-tauri/target/release/xpiedb.exe`;
the NSIS installer is produced under `src-tauri/target/release/bundle/nsis`.
On macOS the app is `src-tauri/target/release/bundle/macos/XpieDB.app` and the
disk image is under `src-tauri/target/release/bundle/dmg`. macOS builds are
unsigned and not notarized: Gatekeeper blocks them on other Macs until they are
signed with an Apple Developer ID. The first Keychain access from an unsigned
development binary may show a system prompt.
The library supports offline manual game creation, editing, deletion, tags,
rich-text notes, managed covers, and custom platforms.

Milestone 1 verified on Windows on 2026-09-15: formatting, the migration test,
Clippy with warnings denied, frontend build, native development launch, and
production NSIS build all passed. The release executable was also launched
and visually checked. Installer installation/uninstallation was not tested.

## Local Library

- A compact top toolbar replaces the left navigation rail. Library, Add Game,
  Platforms, and Settings are primary destinations; presentation controls sit right.
- Grid and List share selected-game state and a fixed 320px right inspector with
  a 264px cover. The first game selects on launch; deletion selects the next entry
  or previous final entry. Empty libraries have no inspector.
- Library and inspector scroll independently below the stationary toolbar.
  Inspector entrance motion respects reduced-motion preferences and does not
  replay on selection changes. Minimum window width is 1040px.
- Account follows Platform in the form and inspector. Explicit Edit, Save, and
  Cancel remain; reusable stars support hover, keyboard navigation, and clearing.
- Cover Grid and Compact List share the same records. View and four discrete
  cover sizes persist in SQLite preferences. Card width stays fixed as the
  window changes size; more space produces more columns.
- Platforms contains lightweight platform management. Built-in platforms use
  original text marks rendered locally, not third-party logos or remote URLs.
  Custom icons can replace those marks. Only unused custom platforms can be deleted.
- Built-in marks retain their neutral local text identities with consistent
  alignment and padding, without a surrounding frame. No external logos added.
- A dedicated Library utility bar provides immediate structured-field search,
  six single-choice filters in a compact Fluent popover, nine sort orders, and
  Clear All Filters. Active filter count and selected values identify narrowing.
- Search matches all whitespace-separated terms across title, platform name,
  Account, genre, developer, publisher, and tags, ignoring case and repeated
  whitespace. Rich-text Notes are deliberately not searched.
- Filters combine with AND. Account and genre choices come from the full catalog;
  platform choices come from managed platforms; assigned tag names come from the
  existing tags table through game records. Null/blank Accounts have a separate
  No Account choice. Clear All preserves sort, view, and cover size.
- Sorting is applied after narrowing, with title/ID tie-breaks and missing dates
  or ratings last in both directions. Sort persists through the existing preferences
  table; search and filters reset on restart. No schema migration is needed.
- The inspector keeps its selection while visible, selects the first result if
  filtered out, and disappears for no results. Ctrl+F (Cmd+F on macOS) focuses Library search.
- Tags are trimmed and deduplicated using SQLite NOCASE (ASCII case folding).
  Saving a game and replacing its tags is atomic. Deletion cascades junctions.

## Notes And Images

[Tiptap React](https://tiptap.dev/docs/editor/getting-started/install/react) 3.31.3
was selected for its maintained React integration, explicit React 19 peer support,
controlled HTML output, and established ProseMirror editing behavior. Its packages
are one editor stack. Only paragraphs, bold, italic, underline, lists, and links
are enabled. The editor is loaded on demand rather than in the initial library bundle.

Rust sanitizes notes on both save and retrieval using
[Ammonia](https://docs.rs/ammonia/latest/ammonia/). The allowlist excludes scripts,
events, styles, images, embeds, and relative/unsafe URLs. HTTP/HTTPS links go through
a Rust URL validator and Tauri's opener plugin to the default browser; there is no
frontend shell access. A restrictive production content security policy adds defense
in depth. Dialogs use the WebView's native dialog lifecycle with Fluent controls and
theme tokens to avoid an observed Fluent modal unmount accessibility issue.

Native image selection is owned by Rust. JPEG, PNG, and WebP are decoded and
validated (20 MB file limit, 8192-pixel dimension limit, bounded decoder allocation).
Original bytes are copied without conversion into `covers/<uuid>.<ext>` or
`platform-icons/<uuid>.<ext>` under the Tauri app-data directory. Only relative
managed paths are stored. Path validation rejects traversal and paths resolving
outside the app-data directory. The frontend receives image data through a narrow
command, not arbitrary filesystem access.

After replacement or deletion, files are removed only when neither games nor
platforms reference them. Cancel discards newly imported unused files. A process
crash during editing can leave an unused image; automatic broad file deletion is
deliberately avoided. Cleanup failures do not roll back an already committed record.
Missing or unreadable images display the application-owned placeholder.

## Milestone 2 Structure

- `src-tauri/migrations/002_library.sql`: catalog schema and platform seed.
- `src-tauri/src/catalog.rs`: validation, sanitization, CRUD, tags, and preferences.
- `src-tauri/src/assets.rs`: image import, resolution, display, and reference-aware cleanup.
- `src-tauri/src/backup/`: backup, validation, restore, and their tests.
- `src-tauri/src/report/`: PDF report model, layout, and tests.
- `src-tauri/src/commands.rs`: narrow IPC wrappers, native picker, and safe URL opening.
- `src-tauri/src/tests.rs`: temporary-database and image regression tests.
- `src/components/`: Library, GameForm, GameDetail, PlatformManager, Notes editor/view,
  shared images, and confirmation dialogs. React state owns view and draft state.

Commands: `list_games`, `get_game`, `save_game` (create or update), `delete_game`,
`list_platforms`, `save_platform`, `delete_platform`, `get_preferences`,
`set_preference`, `select_image`, `image_data`, `discard_image`, `open_link`, and
the existing `get_app_data_info`. Tag assignment/removal happens through `save_game`.

## Review Before Milestone 3

See [Milestone 2.5 verification](docs/milestone-2.5-verification.md) for the shell,
Account migration, star-rating, and desktop regression checks.

At the Milestone 2.5 checkpoint, IGDB, export, backup/restore, and advanced
search/filtering were not implemented. Installer installation/uninstallation remains a separate packaging
check. Consider broader Unicode tag case folding only if the library needs it.

## Milestone 3 Verification

Run `npm test` for focused search/filter/sort and selection tests using Node's
built-in test runner; no test framework dependency is required. See
[Milestone 3 verification](docs/milestone-3-verification.md) for desktop and
750-record performance checks. Stats, IGDB, saved searches, and query syntax
were outside Milestone 3 scope. IGDB is now implemented in Milestone 4.

`npm run test:ui` runs mocked interaction tests in installed Microsoft Edge (Windows) or Playwright's Chromium (macOS, after `npx playwright install chromium`) using
Playwright, with an isolated Vite server on port 1421. These tests use no real
credentials or catalog. The ordinary Rust suite also needs no credentials;
explicit native credential-store checks and their cleanup are documented in the
Milestone 4 report.
