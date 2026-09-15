# GameVault

GameVault is a Windows desktop application for cataloging a personal video game collection.

The project principle is simple: a durable local library where the user owns the data. GameVault does not require an account, subscription, cloud storage, or a server.

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

Prerequisites:

- Windows 10 or newer
- Microsoft Visual Studio 2022 Build Tools with MSVC
- WebView2
- Node.js and npm
- Rust stable MSVC toolchain

Install dependencies:

```powershell
npm install
```

Run the desktop app in development mode:

```powershell
npm run tauri dev
```

Build the production Windows app:

```powershell
npm run tauri build
```

## Application Data

GameVault uses Tauri's application data directory rather than hardcoded user paths.

On Windows, the current application identifier resolves this to
`%APPDATA%\com.gamevault.desktop`. The database is `gamevault.db`, with
`covers` and `backups` directories alongside it.

The foundation currently prepares:

```text
GameVault/
├── gamevault.db
├── covers/
└── backups/
```

The SQLite database is a normal portable SQLite database. Personal databases, covers, backups, logs, and secrets are ignored by Git.

## Database

Migration 1 establishes migration bookkeeping and `app_meta`. Migration 2 adds
`platforms`, `games`, `tags`, `game_tags`, and `preferences`, plus 20 built-in
platforms. Each migration applies its SQL and completion record within one
transaction. Migration 3 adds nullable free-text `games.account`; existing games
retain their data with Account unset. Failed migrations roll back both schema
changes and bookkeeping.

`rusqlite` is configured with the `bundled` feature so GameVault does not depend on a separate SQLite installation.

## Backup And Restore

Backup and restore are planned for Milestone 5. The intended behavior is to back up the SQLite database and all collection-owned local assets, including cover images.

## IGDB

IGDB integration is planned for Milestone 4 and has not been implemented in Milestone 1.

Before implementation, GameVault should confirm the current official authentication model and avoid committing credentials or exposing private secrets in frontend JavaScript. A personal-use flow with user-supplied credentials stored by the desktop app may be acceptable if handled carefully.

## Foundation Checks

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
npm run build
npm run tauri dev
npm run tauri build
```

The migration test checks repeated initialization and preservation of existing data.
The Windows release executable is `src-tauri/target/release/gamevault.exe`;
the NSIS installer is produced under `src-tauri/target/release/bundle/nsis`.
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
- An optional Library utility slot remains unrendered until future controls exist.
  No Stats placeholder, search, filters, or sorting controls are implemented.
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

No IGDB, export, backup/restore, advanced search/filtering, or general state library
is implemented. Installer installation/uninstallation remains a separate packaging
check. Consider broader Unicode tag case folding only if the library needs it.
