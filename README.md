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

Database migrations are created from the beginning. Milestone 1 creates the migration bookkeeping table and a small `app_meta` table only. The collection schema begins in Milestone 2.

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
The current UI is a foundation shell; collection operations start in Milestone 2.

Milestone 1 verified on Windows on 2026-09-15: formatting, the migration test,
Clippy with warnings denied, frontend build, native development launch, and
production NSIS build all passed. The release executable was also launched
and visually checked. Installer installation/uninstallation was not tested.

## Decisions Before Milestone 2

- Confirm whether the first library experience should use a selected detail pane or a separate detail view.
- Confirm whether notes should support plain text only for V1.
- Confirm whether the initial manual add form should allow an arbitrary local cover path immediately or defer cover selection until after core CRUD is working.
