# Milestone 2 Verification

Verified on Windows on 2026-09-15, starting from Milestone 1 commit
`26a4b9e85f2660ca0b27098941f02bc97e56da8c`.

## Automated Checks

- `cargo fmt --check`: passed (using the `src-tauri/Cargo.toml` manifest).
- `cargo clippy --all-targets -- -D warnings`: passed.
- `cargo test --locked`: 8 tests passed. Database tests use temporary files or
  in-memory SQLite, never the personal application database.
- Covered migration rollback/repeatability/preservation, CRUD and null metadata,
  platform seeds and relationships, custom platform updates and deletion guards,
  tags, sanitized notes, preferences across reopen, image validation/path guards,
  and shared-image deletion protection.
- `npm run build`: passed. Editor is a separate on-demand chunk; no size warning.
- `npm audit --audit-level=moderate`: zero vulnerabilities.
- `npm run tauri build`: passed; x64 NSIS installer and release executable produced.

## Desktop Workflow

The development app used a separate `com.gamevault.verification` application-data
directory via a local ignored Tauri config. WebView automation exercised actual
UI controls and real Rust commands; Windows native dialogs selected the image
fixture. A temporary local WebView debugging argument was used for verification
only and is not configured in the app or package.

- Added three games on PC, Nintendo Switch, and PlayStation 5, with different
  statuses, physical/digital media, tags, rating, and optional metadata.
- Imported an application-owned PNG through the native picker; verified the
  copied UUID cover path and inline image display. Original source was preserved.
- Saved bold rich-text notes and a hyperlink. Sanitized HTML persisted and rendered.
- Opened the notes hyperlink in the default browser; confirmed Example Domain.
- Switched Cover Grid/Compact List and selected Extra Large covers.
- Added a custom platform, selected its local icon, and assigned a game to it.
  Confirmed its PNG icon renders in Compact List.
- Edited a title/platform, then attempted another title edit and canceled it;
  the canceled title was not saved.
- Closed/relaunched the app and confirmed all records, notes, custom platform,
  List preference, and Extra Large cover size persisted.
- Edited publisher, restarted again, and confirmed the edit persisted.
- Deleted the covered, tagged test game through confirmation. The game and
  junctions disappeared, its unused cover was removed, and foreign-key checks passed.
- Inspected grid at 1180px and checked 880px minimum desktop width. Extra Large
  cards remain 264px wide, independent of window size; no page-level overflow.
- Launched the production executable, verified the empty real library, loaded
  the on-demand editor, and canceled the form. Migration 2 and 20 seeded platforms
  were present; SQLite integrity check returned `ok`.

## Diagnostics And Limits

- Resolved Clippy style findings, initial Vite bundle-size warning, and a Fluent
  modal unmount accessibility issue observed during the link workflow.
- A development Fast Refresh invalidation was resolved by separating the notes
  utility from the shared component module.
- npm's existing esbuild install-script approval notice appeared during install;
  builds succeed with the installed binary. No security vulnerabilities were reported.
- Git emitted normal LF-to-CRLF notices. No remaining compiler/build warnings.
- Installer installation/uninstallation was not exercised.
- Abnormal shutdown during image editing can leave an unused managed file;
  deliberate saves, cancellation, replacement, and deletion perform reference checks.

## Artifacts

- `src-tauri/target/release/gamevault.exe`
- `src-tauri/target/release/bundle/nsis/GameVault_0.1.0_x64-setup.exe`

Build outputs, test configuration, personal databases, cover/icon caches, backups,
and secrets are excluded from Git. Milestone 3 has not begun.
