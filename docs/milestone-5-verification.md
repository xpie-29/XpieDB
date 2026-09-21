# Milestone 5 Verification

Backup and restore, verified on macOS (Apple Silicon) on 2026-09-21, on the
`macos-port` branch. An earlier Windows implementation was never committed, so this
is a fresh implementation designed for this codebase; nothing was carried over.

## Design

- Archive: ZIP with `manifest.json`, `xpiedb.db`, and referenced `covers/<uuid>.<ext>` and
  `platform-icons/<uuid>.<ext>`. Format version 1. Implemented in `src-tauri/src/backup/mod.rs`.
- Rust owns every path. The chosen restore file stays in Rust state between the
  choose and confirm commands, so the frontend cannot substitute another path.
- Snapshot uses `VACUUM INTO`, a consistent copy while the app is running. No
  schema migration was added; the `backups/` directory already existed.
- Credentials are excluded by design (OS credential store).
- One backup or restore runs at a time; the UI also locks navigation while working.

## Restore order

1. Inspect the archive: entry names, sizes, manifest, format and schema version.
2. Extract into a staging directory inside the app-data directory (same filesystem).
3. Verify the database: integrity check, foreign-key check, required tables,
   `trusted_schema=OFF`, forward migration, and that every image reference is a managed path.
4. Back up the current library to `backups/xpiedb-pre-restore-<timestamp>.zip`.
   If this fails, the restore is cancelled before anything is changed.
5. Move the live database and image folders aside and move the staged ones in.
   Any failed rename is undone in reverse order.

## Automated results

- `cargo test --locked`: 35 passed, 2 ignored (native credential-store tests).
  11 are new backup tests:
  - Round trip: records, tags, notes, cover bytes and platform icon restored; the
    pre-restore safety backup holds the replaced state and can itself be restored.
  - Restore into an empty installation; backup overwriting an existing file; backup
    refused when there is no library; no `.part` or staging directories left behind.
  - Nine hostile archive shapes rejected (missing manifest or database, `../` and
    nested traversal, absolute path, unmanaged and non-UUID names, directory entry,
    stray file), plus non-zip and missing files.
  - Newer schema, newer format, foreign format, and malformed manifest refused.
  - Six damaged-content cases (not SQLite, truncated, corrupted pages, wrong tables,
    image path escaping the managed folders, fake image data): each fails and the
    live library is unchanged with no staging leftovers and no safety backup written.
  - Image extension must match its content.
  - A version-2 database from an earlier build is migrated forward on restore.
  - Journal rollback, and a swap that fails after the live library was moved aside
    returns it intact.
- The security tests were mutation-checked: disabling the entry-name check, the
  integrity check, or the image content check each made the matching test fail.
- `npm run test:ui`: 18 passed (7 new): result and cancel messages, failure display,
  confirmation contents, reload after restore, cancelling restores nothing and clears
  the pending path, invalid file, no file chosen, controls disabled while working.
- `npm test` (47), `npm run build`, `cargo fmt --check`, and
  `cargo clippy --all-targets -D warnings` pass. The dev app starts cleanly.

## Not verified

- The native save and open dialogs and the real command-to-UI path were not driven by
  automation (no screen access in this environment). The UI tests mock IPC, and the
  Rust tests exercise the same functions the commands call, but the wiring between
  them needs a manual pass: back up, change the library, restore, confirm the changes revert.
- Windows behavior is untested. The code uses no platform-specific calls (renames are
  same-directory and same-filesystem), but Windows can refuse to rename a directory
  another process holds open, for example an antivirus scan of `covers/`. That case
  is handled by the rollback path and reported as a failed restore with the previous
  library kept.
- Large libraries were not timed. Restore decodes nothing; it only checks each image's
  format signature.

## Known limits

- A crash in the few milliseconds between the swap renames could leave the library
  split between the app-data directory and a `.restore-*` folder. The automatic
  safety backup exists by then, and nothing is deleted before the swap completes.
- Safety backups accumulate in `backups/` and are not pruned automatically.
- Backups are not encrypted, and notes and account names are stored as plain data.
