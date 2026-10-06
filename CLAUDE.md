# XpieDB: project guide for Claude

XpieDB is a local-first desktop app for cataloging a personal video game collection (Tauri 2 + Rust +
React/TypeScript + Fluent UI, SQLite via `rusqlite`). It was built for Windows first, then ported to macOS,
and is now cross-platform. Created by Xpie, ChatGPT and Claude. Repository: github.com/xpie-29/XpieDB (public,
default branch `master`, no other branches). The README is the full feature and architecture reference; this
file is what a new session needs to start working safely.

## Working with the owner
- The owner is not a developer. Explain in plain language, say what was and was not verified, and ask before
  anything outward-facing. **Commit only when asked. Never push**: the shell has no GitHub credentials, so the
  owner pushes from their terminal (`git push`). Keep commits focused, one concern per commit.
- The owner develops on this Mac and runs the **installed app** (`/Applications/XpieDB.app`), built with
  `npm run install:mac`. The dev app (`npm run tauri dev`) and the installed app share one data folder, so do
  not run both at once, and quit the installed app before changing its database from outside.
- The owner's current library (`~/Library/Application Support/com.xpiedb.desktop`: `xpiedb.db`, `covers/`,
  `platform-icons/`, `backups/`) is **temporary**: as of 2026-10-04 the owner said not to worry about corrupting
  it, because they will start again with a fresh install and new database once the app is at the level they want
  to use. Schema migrations and the installed app may therefore be tried on it directly. It is still polite to keep
  using the sandbox (`scripts/mac-test-run.sh`) for UI experiments, since it needs no cleanup and never affects the
  installed app. Test data lives only in `tests/ui/libraryMock.ts`.
- Screen capture is enabled for this app: `screencapture -x -o -l <windowid>` after finding the window id with
  CoreGraphics (a small Swift snippet) lets you check the real native window.
- **Real-window testing is a standard step for UI changes** (the owner expects it; mocked Playwright tests alone
  missed a horizontal-scrollbar bug and several reader bugs). Use the sandbox, not the installed app. Build with
  `npm run tauri build -- --bundles app`, then `scripts/mac-test-run.sh` launches that build with `HOME` pointed at
  `/tmp/xpiedb-sandbox`, seeded with a **copy** of the real library (`--empty` for a blank one, `--stop` to quit and
  delete it). `swift scripts/mac-window.swift` prints the window id and origin (screen points);
  `screencapture -x -o -l <id> out.png` captures it (2x scale, so screenshot pixels / 2 = points; a screenshot
  displayed at 2000 px wide from a 2360 px original needs x1.18). `swift scripts/mac-click.swift click|dblclick|drag|scroll|type`
  sends real mouse and keyboard events (screen point = window origin + point in window); bring the window forward
  first with `osascript -e 'tell application "System Events" to tell process "xpiedb" to set frontmost to true'`.
  AppleScript `click at` does not work on the web content. Look at the screenshot after each step, and check
  preference/db effects with `sqlite3` on the sandbox copy. The owner may be using the computer, so tell them
  before taking over the mouse.
- **Windows testing** is possible through the owner's Windows 11 ARM VM in Parallels, with no way to run commands
  in it directly (Standard edition): see `scripts/windows-vm/README.md` (shared-folder job runner, build, screenshots,
  clicks) and `docs/windows-verification-0.2.0.md` for what has been checked. The owner must start the runner
  (`runner.ps1`) in the VM each session. Tell the owner before taking over the VM's mouse.
- The shell is zsh: quoting and word-splitting differ from bash. Rust and Node come from Homebrew, and Rust is
  not on the default PATH: use `export PATH="/opt/homebrew/opt/rustup/bin:$PATH"`.

## Verification gate (all must pass before calling work done)
```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked     # 182 passed, 4 ignored
npm test                                                      # 98 passed (node:test, TypeScript type-stripping)
npm run build                                                 # tsc + vite
npm run test:ui                                               # 207 passed (Playwright, Chromium, mocked IPC)
```
Format TypeScript with `npx --no-install prettier --write <files>`; Rust with `cargo fmt`. If the project folder
is ever moved or renamed, run `cargo clean --manifest-path src-tauri/Cargo.toml` first (Tauri caches absolute
paths and the build fails otherwise).

## Architecture rules that matter
- **Rust owns persistence, files and secrets.** The frontend calls narrow Tauri commands and never supplies
  filesystem paths, URLs to fetch, or secrets. IGDB, Steam and Twitch secrets live in the OS credential store
  (`src-tauri/src/igdb/store.rs` selects Windows Credential Manager or macOS Keychain), are never returned to the
  frontend, and never appear in logs or error text.
- **Modules** (`src-tauri/src/`): `catalog.rs` (games, platforms, tags, preferences, backlog order),
  `storage.rs` (migrations 1-11), `system_accent.rs` (the OS accent colour), `assets.rs` (managed images), `backup/` (zip backup and restore),
  `report/` (PDF reports via `krilla`), `igdb/` (IGDB client, auth, models), `steam/` (Steam import),
  `hardware.rs` (Hardware collection), `guides.rs` (Guides collection), `guide_files.rs` (PDF/ePub copies), `file_server.rs` (the `guidefile` scheme), `archive/` (Internet Archive lookup and download), `menu.rs` (Help menu and About), `commands.rs`. Frontend: `src/App.tsx` plus `src/components/`;
  pure logic in `src/stats.ts`, `libraryQuery.ts`, `steamImport.ts`, `listOrder.ts` (kept free of Tauri so
  `node --test` can run it).
- **Schema changes are migrations** (`src-tauri/migrations/NNN_*.sql`, registered in `storage.rs`), each applied
  in a transaction with its bookkeeping row. Add a rollback test like the existing ones. Backups restore older
  schemas forward and refuse newer ones; `catalog::normalize_backlog` runs at startup and on restore.
- **Backlog invariant** (Rust-enforced): a game has `backlog_position` exactly when its status is `Backlog`, and
  positions are 1..N with no gaps. Keep every write path consistent with it.
- **Hardware invariants** (Rust-enforced in `hardware.rs`): a parent is always a `system`, systems have no
  parent or compatibility list, accessories are never deleted with their system (they go with it when it is sold,
  or become loose and remember `former_parent_name`). Hardware photos reuse the `covers` folder.
- **Guides** (`guides.rs`): a guide may link to a game (`game_id`) or name one you do not own (`game_title`).
  Deleting a game never deletes its guides: `catalog::delete_game` copies the title into `game_title` first.
  Guide photos reuse the `covers` folder like Hardware photos. **Guide files** (`guide_files.rs`) are PDFs/ePubs
  copied into `guide-files/<uuid>.<ext>` after checking their content (not their name); the frontend only ever
  names a file by id, Rust picks the file with a dialog, and files are **not in backups** (the owner chose that;
  a restored database shows missing files as such). **In-app PDF reader** (`src/components/Reader.tsx`, `src/pdfReader.ts`): PDF.js, lazy-loaded; the reader gives PDF.js
  exact byte ranges itself (`RangeTransport`) because PDF.js treats a partial reply to its first request as the
  whole file. Rust serves `guidefile://<id>` with Range, 4 MB per reply, id-only. PDF.js's fonts/decoders are copied
  to `public/pdfjs` by `scripts/prepare-pdfjs.mjs` (predev/prebuild); the CSP allows `wasm-unsafe-eval`, workers and
  the `guidefile` scheme. Pop-out window and ePub reading are not built (Part 3 of the plan doc).
  **Internet Archive** (`archive/`): the frontend names an item and a file by Archive id only (never a URL); Rust
  re-reads the item's metadata and downloads only a listed PDF or ePub of an item that is not borrow-only, follows
  redirects only within archive.org, one download at a time, with progress events and cancel. It only adds files to
  guides (or creates a guide for the download); search results are ranked candidates for the owner to review.
  The client was checked against the real service on 2026-10-04 with an opt-in test: `cargo test live_archive --
  --ignored --nocapture` (needs network; counted among the 4 ignored tests).
- **Preferences** are an allow-listed key/value table (`catalog::set_preference`); add new keys there.
- **Steam/IGDB import is add-only**: never modify an existing game. Bulk metadata refresh was deliberately
  rejected by the owner because it could overwrite personal edits; do not build it.
- Product constants: bundle id `com.xpiedb.desktop`, DB `xpiedb.db`, credential services
  `com.xpiedb.desktop.twitch` and `.steam`, repository URL in `REPOSITORY_URL` (`src-tauri/src/menu.rs`).

## Testing conventions
- Rust tests sit beside the code; HTTP is tested against the in-process mock server in `src/testutil.rs`; use
  `tempfile` databases, never the real one.
- UI tests share `tests/ui/libraryMock.ts` (60-game library, Steam library, backlog and IPC behavior mirroring
  the Rust rules). Expected numbers in tests should be computed independently, not from the code under test.
- Two earlier habits worth keeping: mutation-check new safety tests (break the code, confirm a test fails), and
  look at screenshots of any UI change (the aim is not just passing assertions).
- Several checks deliberately run in the macOS window itself. Dragging, native dialogs and menus were verified
  by the owner by hand.

## State of the project
Version **0.2.0** (2026-10-05). The v1 the owner defined is done: local library with covers, rich-text notes,
tags, custom platforms; search, filters, sorting; Statistics ribbon; ordered Backlog; PDF reports; backup and
restore; IGDB search and import; Steam library import; Help > About; macOS and Windows builds. History is one
linear branch, `master`, with a verification report per milestone in `docs/` and a `CHANGELOG.md`.

0.2.0 added (plan and decisions in `docs/plan-collections-and-guides.md`):
- Library: scroll position kept after editing (plus a highlight of the edited game); resizable, saved list columns.
- Platforms: 35 built-in platforms with bundled offline icons, colour tints from the owner's chart (lightened where
  too dark on the dark theme) and a colour/mono switch; Platforms now lives in Settings.
- **Collections**: a toolbar selector for Games, Guides and Hardware (the choice is remembered).
  - Hardware: systems and accessories (parent system, "also works with" platforms), grouped or flat list, one photo,
    purchase/sale details, and a per-accessory question when a system is sold.
  - Guides: linked to games both ways, one photo, PDF/ePub digital copies, **Find on Internet Archive** (ranked
    matches to review, never borrow-only items), and an **in-app PDF reader** (ranged loading, zoom, search,
    contents, bookmarks, night mode, full screen, resume, switching between guides).
- Dev tooling: `scripts/mac-test-run.sh` and the Swift helpers for testing the built app in a sandbox.

Since 0.2.0 (unreleased, from the owner's notes; see CHANGELOG): a split view/collection selector toolbar, a Guides
column, **hidden games** (`games.hidden`, migration 10; `list_games` still returns every game so imports and guide
links see them, the frontend shows `shownGames(...)`, Reports use `list_shown_games`, and the Backlog saves the whole
order with `withHidden` so hidden games keep their places), a **per-game details-panel background** (`panel_bg*`
columns, migration 11; the image is a managed image in `covers`, included in backups and orphan checks), the
**Backlog with a details panel**, Add Guide attach/find actions, and the **accent colour**: the theme is generated
from one colour (`src/accent.ts`, luminance-based so white button text and brand-coloured text stay readable;
`src/theme.ts`), orange `#f7821b` by default, or the OS accent when Settings > Appearance asks (`accent_source`
preference). The OS accent comes from Rust (`system_accent.rs`: Windows registry `HKCU\...\DWM\AccentColor`,
macOS `NSColor.controlAccentColor`) because the CSS `AccentColor` keyword is a fixed blue in both web views.

The owner's next steps, in the order discussed: a **pop-out reader window**, **ePub reading** (foliate-js), an
option to **include guide files in backups** (off by default), then resizable columns and grid views for Hardware
and Guides.

## Known gaps and open items
- **Steam import has never run against the real Steam or IGDB services** (no API keys during development; the
  official docs were unreachable, so endpoints were taken from search summaries). First real run: Settings >
  IGDB and Steam, use each Test connection, then check the "matched on IGDB" count before importing. If the match
  count is 0, suspect the IGDB `external_games` source id lookup (`igdb::ClientState::steam_source_id`).
- **Windows**: the rename from GameVault changed the app-data folder (`com.gamevault.desktop` to
  `com.xpiedb.desktop`) and credential service names, so an old Windows library and saved credentials are not
  found. No migration exists. Windows was tested on 2026-10-06 in an ARM64 VM (tests, build, run, file dialog, reader,
  full screen, About: all fine; see `docs/windows-verification-0.2.0.md`); a real x64 PC and the installer were not.
- The README "Build on your own Mac" guide has not been followed on a clean Mac; tool installation steps and the
  Intel variant are from documentation, not tested.
- No code signing or notarization (deliberately skipped, not wanted); a copy moved to another Mac is blocked by
  Gatekeeper, so other people must build their own.
- PDF reports use bundled DejaVu Sans, so CJK characters print as `?` (counted and reported to the user).
- Verification docs for milestones 2 to 4 keep the old GameVault name on purpose.
- **0.2.0 was verified on macOS, and since 2026-10-06 on Windows ARM64** (migrations 9 to 11, the reader's `guidefile`
  scheme, full screen, native file dialog, About). Migrations 5 to 8 were only exercised by the Rust tests on Windows.
- Not seen in a real window (covered by browser tests only): the Hardware add-accessory and sale dialogs, choosing
  photos, the Guides add/edit form, a download from the Internet Archive dialog, and the reader on a PDF with an
  outline, an encrypted PDF, or link annotations. The platform icon colours were only looked at on the dark theme
  (some are faint on light; see the contrast table in the conversation history: Wii, Xbox, Steam, 360, PC).
- IGDB platform slugs for 14 of the 15 platforms added in 0.2.0 (Steam Deck has no IGDB platform) were written from memory and never tested against IGDB.
- The Internet Archive lookup matches by title only, so results need the owner's review; borrow-only items cannot
  be downloaded (the owner decided against adding Archive credentials: their docs attribute restricted downloads to
  logged-in cookies, not API keys).
- Hardware and Guides lists have fixed columns and no grid view; Hardware and Guides have no reports or statistics.
- A local git stash named "discarded: clickable chart tracking + multi-genre work" holds work the owner chose to
  drop (it is not pushed). `git stash drop` removes it for good.

## Ideas discussed, not built
Click a Statistics chart to filter the Library (the discarded stash holds a first attempt, including splitting
multi-genre games); CSV/JSON export; an in-app reader pop-out window, ePub reading, page thumbnails and two-page
spreads; including guide files in backups; reports and statistics for Hardware and Guides; a "has a guide" filter
in the Library; more report groupings (genre, status, account,
year) and filtering a report to the current Library view; making the Library title sort numeric-aware like the
reports; a Windows data migration. Importing GOG, PlayStation, Nintendo or Xbox libraries was ruled out (no
official access).
