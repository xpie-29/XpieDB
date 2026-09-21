# Milestone 7 Verification

Statistics ribbon, verified on macOS (Apple Silicon) on 2026-09-21 on the `macos-port` branch.

## Design

- Placement: a collapsible ribbon inside the Library's fixed top area, under the search and
  filter bar. The right side is already occupied by the game inspector, so a right sidebar was
  not used. Collapsed, it shows a one-line summary; the choice persists as `stats_open`.
- Scope: statistics describe the games that pass the current search and filters, so the
  filters act as the scope control. The header always says which scope is shown.
- Computation: `src/stats.ts` (pure functions, no I/O) over the games already loaded in the
  app. No schema change, no new dependency, no chart library; marks are plain HTML/CSS.
- Form choices: headline numbers are stat tiles (not one-bar charts); platform, genre and
  developer shares are horizontal bars in a single color; play status is a stacked bar
  with a legend carrying counts and shares; decade, rating and added-per-year are columns.
  Nominal categories are not value-ramped. Tails fold into a gray "Other" row.
- Color: the five play statuses use categorical slots 1-5 in fixed order (each status keeps its
  color regardless of counts). The palette was run through the dataviz validator against the
  ribbon's actual surface (#292929, dark): lightness band, chroma floor, color-blind adjacent
  separation (worst 8.4, target 8), normal-vision floor (worst 19.3), and 3:1 contrast all pass.
  Text uses text tokens, never series colors. Gaps between stacked segments are 2px surface.
- Accessibility: every mark shows a readout on hover and on keyboard focus; every chart has a
  table view with the same numbers; status identity is also carried by the labeled legend.

## Automated results

- `npm test`: 59 passed (12 new for `stats.ts`, using small hand-built fixtures): empty scope
  yields zeros not NaN; platform counts, ordering, tie-breaking, sum to 100%; fixed status
  order with zero counts and unexpected statuses counted as Other; average over rated games only,
  out-of-range ratings treated as unrated; decade ordering with Unknown last; latest ten years added;
  genre/developer list splitting with case-insensitive de-duplication; tail folding; percent
  formatting ("<1%", one decimal under 10%).
- `npm run test:ui`: 41 passed (13 new): default-open ribbon with headline numbers checked
  against arithmetic on the mock data (not the app's own code), platform bars and Other fold,
  status legend, hover and keyboard readouts, all five tabs, table views, collapse with
  one-line summary and persistence, saved-collapsed startup, scoping by search (and restore),
  no-match message, empty library, single-game/missing-data rendering without NaN, and no
  horizontal overflow at the 1040px minimum width.
- `cargo test`: 56 passed (1 new: `stats_open` accepts only "true"/"false").
- `cargo fmt --check`, `cargo clippy --all-targets -D warnings`, `npm run build` pass; the app starts.

## Visual verification

Rendered at 1180x760 with a 60-game, 8-platform sample (expanded, collapsed, each tab, table
view). Found and fixed: the first layout was too tall (about 400px, clipping card bottoms); it
now fits without internal scrolling at the default window size (ribbon 369px, leaving 282px for
the library at 760px tall) and collapses to one line when more room is wanted.

## Not verified

- Behavior in the native app window (the UI tests and screenshots use a browser with mocked
  IPC). Please open the Library in `npm run tauri dev` and try collapsing, filtering and the tabs.
- Very large libraries were not timed. Statistics are recomputed when the filtered set changes;
  the work is linear in the number of games.
- On short windows (under about 700px tall) the expanded ribbon caps at 46% of the window
  height and scrolls internally.

## Not included

Trend over time beyond games-added-per-year, comparison between two filter scopes, exporting
statistics, and clicking a chart mark to filter the Library (a natural next step).
