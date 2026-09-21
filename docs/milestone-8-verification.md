# Milestone 8 Verification

Backlog, verified on macOS (Apple Silicon) on 2026-09-21 on the `macos-port` branch.

## Design decisions

- **Backlog is a new play status**, separate from Not Started (chosen by the user). Not Started
  means owned with no plan; Backlog means queued. Existing games are unchanged.
- **Storage:** nullable `games.backlog_position` (migration 4) with `CHECK (>= 1)`. No unique
  index: SQLite checks uniqueness per row, which would break bulk renumbering. Uniqueness is
  enforced by Rust and verified by tests.
- **Invariant, maintained in Rust:** a game has a position exactly when its status is Backlog,
  and positions are 1..N with no gaps. Every write path keeps it: saving a game (append when
  it becomes Backlog, release and close the gap when it stops), deleting, `backlog_add`,
  `backlog_remove`, `backlog_set_order`.
- **Reorder safety:** `backlog_set_order` takes the whole order and must match the current
  backlog exactly (no missing, extra, duplicate, or unknown ids), all in one transaction. A
  stale screen gets an error and the UI reloads the saved order.
- **Self-repair:** `normalize_backlog` runs at startup and on restore. It clears stray
  positions, appends Backlog games that lack one (by id), keeps valid relative order, and
  renumbers.
- **Frontend:** pointer-based drag (the list holds pointer capture, so rows can reorder live
  without losing the drag; this also avoids depending on HTML5 drag-and-drop, which is
  unreliable in some webviews), keyboard reordering on the handle, saves serialized so the last
  request wins, optimistic order shown while saving, edge auto-scroll while dragging, and a
  screen-reader announcement for each move.
- Reports: a third preset with a numbered leading column. Statistics: a sixth status.

## Automated results

- `cargo test --locked`: 76 passed, 3 ignored. New (21): status validity and append-to-bottom;
  leaving the backlog closes gaps and rejoining goes to the bottom; edits keep position;
  delete closes gaps; reordering and persistence across reopen; six kinds of malformed or
  stale orders rejected with no change; add-to-backlog ordering, dedupe, and atomic failure;
  remove-from-backlog validation; repair of a broken backlog; the CHECK constraint; upgrade
  of a version-3 library; migration 4 rollback; backup/restore keeps order and repairs a broken
  backlog; the older-schema restore gains the column; report preset (order, numbers, page
  breaks, empty message, deserialization). One existing test assumed "version 4" was the next
  unused migration number; it now derives the number.
- `npm test`: 63 passed (4 new: statuses/Backlog counts, `moved`/`clampIndex` helpers).
- `npm run test:ui`: 60 passed (19 new: backlog list and order, keyboard and mouse
  reordering including to the extreme ends, no-op drops, Move to top, rapid moves sent in order,
  failed save recovery, Start playing, Remove, Add games with tick order, empty state,
  Edit returning to the Backlog, inspector position, filter option, report preset).
- Mutation check: sending the wrong order to the backend made 6 UI tests fail. A second mutation
  (never restoring keyboard focus after a move) was **not** caught: in Chromium, focus survives
  the reorder anyway, so that safeguard for other webviews is unverified.
- `cargo fmt --check`, `cargo clippy --all-targets -D warnings`, `npm run build` pass.
- The migration was run against the real application database (60 games): all rows intact,
  column present, integrity check `ok`.

## Visual verification

Screenshots of the Backlog page (normal and mid-drag), the Add games dialog, and the Statistics
ribbon with six statuses; a sample Backlog PDF (24 games) rendered and its text extracted.
Found and fixed: the Add dialog's content was wider than the dialog and clipped.

## Color note

Adding Backlog makes six status colors. The validator passes every hard check for the six-slot
set against the ribbon surface; the sixth slot (green, `#008300`) is 2.94:1 against `#292929`,
just under the 3:1 guideline. The relief rule applies and is satisfied: every value is also
shown in the labeled legend with counts and percentages, and every chart has a table view.

## Not verified

- Real mouse dragging in the native window (WKWebView). The tests drive Chromium with synthetic
  mouse events. Please try dragging, keyboard moves, and Add games in `npm run tauri dev`.
- The edge auto-scroll while dragging (no automated test); the logic is a simple interval.
- Very long backlogs (hundreds of entries) were not timed. Each reorder rewrites every position
  in one transaction, which is fast at this scale; the Add dialog renders at most 200 rows.
- Windows.

## Not included

Sub-lists or multiple named queues, drag from the Library into the Backlog, priorities or due
dates, and bulk removal.
