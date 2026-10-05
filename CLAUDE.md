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
- Never touch the owner's real library: `~/Library/Application Support/com.xpiedb.desktop` (`xpiedb.db`,
  `covers/`, `platform-icons/`, `backups/`). It currently holds their real data. The 60 "Sample Game" rows used
  in early testing were deleted; test data lives only in `tests/ui/libraryMock.ts`. Use a temp `HOME` or temp
  directories for experiments, and make a copy before any manual database edit.
- Screen capture is enabled for this app: `screencapture -x -o -l <windowid>` after finding the window id with
  CoreGraphics (a small Swift snippet) lets you check the real native window.
- **Real-window testing is a standard step for UI changes** (the owner expects it; mocked Playwright tests alone
  missed a horizontal-scrollbar bug). Never use the installed app or the real library for it. Build with
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
- The shell is zsh: quoting and word-splitting differ from bash. Rust and Node come from Homebrew, and Rust is
  not on the default PATH: use `export PATH="/opt/homebrew/opt/rustup/bin:$PATH"`.

## Verification gate (all must pass before calling work done)
```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked     # 133 passed, 3 ignored
npm test                                                      # 88 passed (node:test, TypeScript type-stripping)
npm run build                                                 # tsc + vite
npm run test:ui                                               # 133 passed (Playwright, Chromium, mocked IPC)
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
  `storage.rs` (migrations 1-6), `assets.rs` (managed images), `backup/` (zip backup and restore),
  `report/` (PDF reports via `krilla`), `igdb/` (IGDB client, auth, models), `steam/` (Steam import),
  `hardware.rs` (Hardware collection), `menu.rs` (Help menu and About), `commands.rs`. Frontend: `src/App.tsx` plus `src/components/`;
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
Feature-complete for the v1 the owner defined: local library with covers, rich-text notes, tags, custom platforms;
search, filters, sorting; Statistics ribbon; ordered Backlog (new `Backlog` status); PDF reports (all games,
by platform, backlog; Letter/A4); backup and restore; IGDB search and import; Steam library import matched to
IGDB; Help > About; macOS and Windows builds. History is one linear branch, `master`, with a verification
report per milestone in `docs/` and a `CHANGELOG.md`.
Collections work (plan in `docs/plan-collections-and-guides.md`): the collection selector and the **Hardware**
collection (systems and accessories, grouped/flat list, add/edit, sale dialog) are built; **Guides** is a
placeholder screen, and the guide files / Internet Archive parts are still only a plan. Hardware list columns are
fixed (not yet resizable) and it has no grid view.

## Known gaps and open items
- **Steam import has never run against the real Steam or IGDB services** (no API keys during development; the
  official docs were unreachable, so endpoints were taken from search summaries). First real run: Settings >
  IGDB and Steam, use each Test connection, then check the "matched on IGDB" count before importing. If the match
  count is 0, suspect the IGDB `external_games` source id lookup (`igdb::ClientState::steam_source_id`).
- **Windows**: the rename from GameVault changed the app-data folder (`com.gamevault.desktop` to
  `com.xpiedb.desktop`) and credential service names, so an old Windows library and saved credentials are not
  found. No migration exists. Windows was not tested after the macOS work.
- The README "Build on your own Mac" guide has not been followed on a clean Mac; tool installation steps and the
  Intel variant are from documentation, not tested.
- No code signing or notarization (deliberately skipped, not wanted); a copy moved to another Mac is blocked by
  Gatekeeper, so other people must build their own.
- PDF reports use bundled DejaVu Sans, so CJK characters print as `?` (counted and reported to the user).
- Verification docs for milestones 2 to 4 keep the old GameVault name on purpose.

## Ideas discussed, not built
Click a Statistics chart to filter the Library; CSV/JSON export; more report groupings (genre, status, account,
year) and filtering a report to the current Library view; making the Library title sort numeric-aware like the
reports; a Windows data migration. Importing GOG, PlayStation, Nintendo or Xbox libraries was ruled out (no
official access).
