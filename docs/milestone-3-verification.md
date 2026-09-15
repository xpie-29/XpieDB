# Milestone 3 Verification

Implemented from clean checkpoint `758ff35cd1765b9a76116b18c71a33933601d1b5`
on Windows on 2026-09-15. The remaining manual checks and checkpoint instructions
were supplied in the follow-up. All manual verifications are confirmed passed.

## Design Decisions

- Filter and sort the already-loaded catalog in `src/libraryQuery.ts`, shared by
  Grid and List. Rust retains persistence, validation, and managed-file ownership.
- Search uses case-insensitive, whitespace-normalized terms with AND matching
  across title, platform name, Account, genre, developer, publisher, and tags.
  Notes HTML is deliberately excluded. No online engine or query language.
- Six single-select filters combine with AND. Options derive from the full catalog,
  not the current result set, so narrowing never hides useful filter choices.
  Platform options use managed platform records, including custom entries. Tag
  names come from the existing tags table through list_games; normal CRUD prunes
  orphan tags. Account/genre options ignore empty values and deduplicate by case.
- No Account matches null/blank values. Named values use a separate internal key;
  literal accounts named No Account or All Accounts are labeled as named accounts.
- The compact utility bar sits below primary navigation. Search receives flexible
  space; a Fluent popover contains six labeled filters. The closed filter control
  shows active count and exposes a tooltip summary. Clear All has a labeled icon.
- All nine requested sorts are available. Default Title A-Z preserves the existing
  convention. Missing ratings/dates sort last either way; ties use title then ID.
- Sort is validated and upserted into the existing preferences table. Existing
  databases receive a default on read; no schema change/migration was required.
  Search and filters are transient. Clear All does not alter sort/view/cover size.
- Selection remains if visible, otherwise chooses the first sorted result or null.
  Editing uses the existing form. Deletion chooses neighbors in visible sort order.
  No-results state has its own Clear All action and is distinct from a truly empty
  library. Filtered count reads N of total games.

## Test Results

- `npm test`: 40 passed, 0 failed. Uses Node's built-in runner and TypeScript type
  stripping (Node 22.18+), without adding a test dependency.
- Tests cover every requested search field, individual/combined filters, null/empty
  metadata, named versus missing accounts, all nine sorts, deterministic ties,
  nonmutating queries, selection fallback/recovery, no results, and clear behavior.
- `cargo test --manifest-path src-tauri/Cargo.toml --locked`: 11 passed, 0 failed.
  Existing preference test now covers all sort values, rejection of invalid values,
  default sort on old databases, and persistence after reopening SQLite.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`: pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings`: pass.
- `npm run build`: TypeScript and Vite pass.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.
- `npm run tauri build`: passed; produced the optimized Windows executable and
  x64 NSIS installer. No Rust, TypeScript, Vite, or Tauri build warnings.

## Desktop Checks

Used the ignored `local-data/verification.json` Tauri identifier override and the
separate `com.gamevault.verification` application-data directory. Personal library
data was not modified or seeded. Created 750 temporary synthetic games with varied
platforms, accounts, genres, statuses, media types, tags, dates, and ratings.

- Partial mixed-case Mario search: 250/750. Nintendo Switch search: 76/750.
  Steam Main: 250/750. Developer and publisher searches: 750/750. Favorite: 375/750.
- Platform filter returned 38/750; all six simultaneous filters returned 13/750.
  Grid and List returned the same ordered titles after waiting for persisted view
  preference completion. Search-only clear retained the selected platform filter.
- No-results state showed 0/750 and removed the inspector. Clear All restored 750,
  preserving Title Z-A and Extra Large covers. Filtering out selection chose a
  matching entry; clearing search kept that entry selected.
- Full process restart retained Rating High to Low, reset search and filters, and
  selected the first visible entry in that saved sort order.
- Ctrl+F focused the search input. Escape closed the filter popover. Native select
  controls retain normal keyboard behavior and labeled fields.
- Checked 1040x600, 1180x760, and 1600x900. No document/utility overflow at minimum
  width; Compact List fits beside the inspector. Popover is opaque after its normal
  Fluent entrance animation, with no overlapping fields.
- Cover widths remain 130/176/218/264px. Wider windows preserve card width. Library
  and inspector scroll independently; document/toolbar remain at zero scroll and
  utility bar remains below the 56px primary toolbar.
- Observed search-and-result browser automation round trips on the 750-card Grid
  were about 19-104ms in a short repeated typing sequence, and up to 233ms in the
  earlier search pass. These are local observations, not a formal benchmark.
  No virtualization was warranted by this test. No frontend page errors observed.

## Final Manual Checks 23-30

The earlier desktop observations and the user's final confirmation establish:

| Item | Verification | Result |
| --- | --- | --- |
| 23 | Activate Clear All Filters | Pass; search and all six filters reset immediately |
| 24 | Complete Library returns | Pass; all 750 records returned before fixture cleanup |
| 25 | Grid/List preference preserved | Pass; Clear All does not change the active view |
| 26 | Cover size preserved | Pass; Extra Large remained selected |
| 27 | Sort preserved | Pass; Title Z-A remained selected |
| 28 | Filtered/unfiltered result counts | Pass; observed 13 of 750, 38 of 750, 0 of 750, and 750 games |
| 29 | Utility bar at practical widths | Pass at 1040, 1180, and 1600px; controls remain usable without layout overflow |
| 30 | Several-hundred-record performance | Pass; documented 750-game test reused, no reseeding required |

Final read-only SQLite verification confirmed zero games, zero tags, and zero
game-tag assignments in `com.gamevault.verification`. All Milestone 3 synthetic
records are removed. Only documentation changed during this checkpoint pass;
the verified production executable and installer still correspond to the source.

## Final Safety Review

No dependency upgrades, external assets, IGDB, Stats, saved searches, or advanced
query syntax. Existing cover and notes code is unchanged; Rust regressions remain.
The existing ignored verification configuration is transient, not a tracked fixture.
Build artifacts and personal database/cover/backup/platform-icon/secret paths stay
ignored. Git LF-to-CRLF notices are informational.

All 750 temporary performance records were removed from the isolated verification
database through guarded test cleanup; the true empty-library state was rechecked.
The personal application-data directory was not used for mutation tests.

## Production Artifacts

- `src-tauri/target/release/gamevault.exe`
- `src-tauri/target/release/bundle/nsis/GameVault_0.1.0_x64-setup.exe`

No MSI is configured. Installer installation/uninstallation was not exercised.
The final release executable launched successfully and its utility bar, sort
control, disabled Clear All action, and empty Library rendered correctly.
Dependency versions and lockfiles are unchanged. The final diff contains only
intended Milestone 3 source, tests, and documentation, with no personal data or
generated build artifacts. Milestone 3 is approved for the checkpoint commit;
no next-milestone work was started.
