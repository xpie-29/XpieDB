# Release 0.2.0 verification

Date: 2026-10-05. Platform tested: macOS (Apple Silicon), dark theme. Not tested: Windows.

## Automated checks (all passing)

| Check | Result |
|---|---|
| `cargo fmt --check` | clean |
| `cargo clippy --all-targets -D warnings` | clean |
| `cargo test` | 175 passed, 4 ignored (3 earlier, plus the opt-in live Internet Archive test) |
| `npm test` | 96 passed |
| `npm run build` | passes |
| `npm run test:ui` | 187 passed (Playwright, Chromium, mocked IPC) |

Safety rules were mutation-checked (the code broken on purpose, a test confirmed to fail): migration rollbacks, the
custom-platform adoption rule, accessories never deleted with their system, a deleted game keeping its guides'
title, guide file content checks and deletion, borrow-only/DRM detection, the archive.org redirect allow-list, the
file server's per-request size cap and id check, and the reader's re-fit and page-number fixes.

## Checked in the real macOS app (on a throwaway copy of the library)

- Library: scroll restored after Cancel; list columns dragged and saved; default widths fit without a horizontal bar.
- Platforms: all 35 icons and colours, the colour/mono switch and its saved preference; the 15 added platforms.
- Upgrade from schema 4 to the current schema on a copy of the real library: all games intact, old platform ids kept.
- Collection selector, Hardware list (grouped and flat), adding a system, the Guides list, guide to game jump and the
  book mark, attaching a real PDF through the native file dialog (checksum matched), refusing a fake PDF, Open and
  Show in folder.
- Internet Archive: live search and a real item's file list in the dialog; a real borrow-only item recognised and a
  real ePub downloaded and identified by the opt-in live test.
- Reader: a 67-page real PDF and a 9.5 MB, 300-page PDF over the `guidefile` scheme; search, page jump, night mode,
  contents panel, bookmarks (saved to the database), switching guides, resume, full screen.

## Not verified here

Windows; the Hardware add-accessory and sale dialogs, the Guides form and Archive downloads in a real window;
light-theme appearance of the platform colours; PDFs with outlines, encryption or link annotations in the real app.

## Version

`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` and both lock files are 0.2.0; the About dialog
and the backup manifest read the version from the app.
