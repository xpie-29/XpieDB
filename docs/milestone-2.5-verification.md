# Milestone 2.5 Verification

Verified on Windows on 2026-09-15, starting from Milestone 2 commit
`3ee61637fbbf501573499fc0d51b85cd85f580bb` with a clean working tree.
Milestone 3 was not started. No dependencies or package versions changed.

## Implementation

- Removed the permanent left navigation rail. The compact top toolbar provides
  Library, Add Game, Platforms, and Settings, with Library presentation controls right.
- The destination definition can accept another destination later. No Stats button
  or speculative tables were added. The optional Library utility slot renders only
  when supplied; no empty row or search/filter/sort functionality is present.
- Grid and List share selection and a 320px fixed, non-overlay inspector. Its cover
  is 264px wide. Library and inspector scroll independently; toolbar stays fixed.
  Selection updates reuse the inspector, without replaying the 140ms entrance.
- First displayed game selects on launch. Deletion selects the next game, or the
  previous game at the end. Final deletion removes the inspector.
- Account follows Platform in models, forms, and details. It is nullable free text,
  trimmed with blank values normalized to null, using existing metadata validation.
  Migration 3 atomically adds the column and migration record; old games retain data.
- StarRating uses existing Fluent icons with hover preview, click, roving keyboard
  focus, arrows, Home/End, Delete/Backspace, and an explicit clear button. Read-only
  stars are shared by the inspector and Compact List. No half-stars or dependency.
- Reviewed all 20 built-in platform marks. Retained original neutral text marks,
  normalized their size/padding/alignment, and removed the surrounding frame.
  Custom local image icons remain supported. No third-party assets were sourced.
- Explicit Save/Cancel, tags, notes, managed covers, and Added/Modified dates remain.

## Automated Checks

| Check | Result |
| --- | --- |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | Pass |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings` | Pass |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | 11 passed, 0 failed |
| `npm run build` | TypeScript and Vite pass |
| `npm audit --audit-level=moderate` | 0 vulnerabilities |
| `npm run tauri dev -- --config local-data/verification.json` | Native development launch passes |
| `npm run tauri build` | Release executable and x64 NSIS installer produced |

Three new tests cover Account migration preservation, rollback when migration
bookkeeping fails, and Account/rating persistence and clearing. Existing eight
tests remain, including CRUD, null fields, tags, repeatable migrations, validation,
safe notes/URL protocols, preferences, platform restrictions, and image validation
with reference-aware cleanup.

## Desktop UX Checks

- Started with populated Milestone 2 verification data; existing records and a custom
  platform image still display after migration. The first game selects automatically.
- Grid/List selection, multiple sequential selections, keyboard navigation, and
  selected styling checked. Inspector DOM identity stays stable across selections.
- Added Account through the real form, edited it, canceled a separate draft, then
  fully restarted the process. The saved Account, cleared rating, List view, and
  Extra Large cover preference persisted.
- Hover did not commit a rating. Click and arrow-key rating changes, five-star
  display, and explicit clearing were checked in the form and inspector. List stars
  displayed ratings 1 through 5 from synthetic fixtures.
- Added formatted Tiptap notes and a safe HTTPS hyperlink. The initial external
  handoff returned success without a visible browser. After independent Windows
  launch diagnostics and an app restart, clicking the sidebar link opened Zen with
  the exact `https://example.com/?gamevault-sidebar` URL confirmed in its address bar.
  No opener code, dependency, browser association, or security setting was changed.
- Used 35 synthetic scroll fixtures plus three verification games. Grid and List
  scroll separately from the inspector; document scroll stays zero and toolbar top
  stays zero. Long notes scroll within the inspector.
- Cover widths measured at 130, 176, 218, and 264px. Inspector cover remains 264px.
  Checked 1040x600, 1180x760, and 1600x900 viewports. Compact List fits at the minimum
  width without horizontal overflow; wider windows retain the chosen card width.
- Selected deletion chose the next entry. With user approval, deleted all 38 test
  games through confirmation dialogs. Final empty state has no inspector. A later
  temporary hyperlink fixture was also removed from the isolated database.
- Platforms and Settings navigation checked. Release executable launched with the
  new shell; Add Game displayed Account and stars, and the draft was canceled.
- Managed cover implementation was not redesigned. Existing automated image import,
  validation, and shared-reference cleanup regressions pass; placeholders and the
  existing custom platform image render in the revised shell.

## Git And Local Data

`local-data/verification.json` is a transient local Tauri configuration override,
not a reusable data fixture. It contains only `com.gamevault.verification` as an
alternate identifier. It was already untracked and ignored by `local-data/`;
no useful tracked fixture was removed. Destructive tests used that separate
application-data directory, never the personal `com.gamevault.desktop` library.

Reviewed tracked paths and ignore behavior for databases, covers, platform-icons,
backups, secrets, environment files, local-data, dist, and Rust build output.
No personal data, credentials, generated artifacts, or transient verification
output is staged. Existing ignore rules cover these paths without changes.

## Artifacts And Warnings

- Executable: `src-tauri/target/release/gamevault.exe`
- Installer: `src-tauri/target/release/bundle/nsis/GameVault_0.1.0_x64-setup.exe`
- Package format: x64 NSIS `.exe`; MSI is not configured.
- No Rust, TypeScript, Vite, or Tauri build warnings remained. Tauri's package-version
  lookup and NSIS bundle patching messages are informational.
- An initial sandbox-only rustfmt path-canonicalization warning disappeared when
  rerun outside the sandbox. Git's LF-to-CRLF notices are informational.
- Installer installation/uninstallation was not exercised. The existing abnormal
  shutdown edge case can leave an unused managed image; this remains accepted.
- The initial browser handoff failure could not be reproduced after the successful
  restart retest. Recheck links if it recurs; do not treat launcher success alone as
  evidence that the browser displayed a page.

The inspector width and 1040px minimum window width are intentional desktop UX
choices to review in actual use. Search/filtering/sorting, Stats, and IGDB remain
out of scope.
