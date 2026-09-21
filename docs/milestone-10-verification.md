# Steam Import Verification

Built on macOS (Apple Silicon) on 2026-09-21 on the `macos-port` branch. Chosen scope: Steam only, matched to
IGDB for covers and fields. **This feature has not been run against the real Steam or IGDB services.** Read
"Not verified" first.

## Design

- **Add-only.** Existing games are never modified. A game is a duplicate when the library already has it on the
  Steam platform, by IGDB id or by normalized title (case, accents, spacing and trademark marks ignored). A game
  owned on another platform is not a duplicate of the Steam copy.
- **Exact matching.** IGDB is asked for `external_games` by Steam app ID, not searched by title. The source id for
  Steam is looked up from `external_game_sources` at run time (IGDB replaced its numeric `category` with
  `external_game_source`) and falls back to the historic id 1. When several IGDB records share an app ID, the
  original game wins over versions and bundles. Requests are batched at 50 app IDs.
- **Steam access.** `GetOwnedGames` (with app info and free games), `ResolveVanityURL` for custom names, and
  `GetPlayerSummaries` for the display name (best effort). HTTPS only, no redirects, bounded response size. The API
  key is part of the URL by Steam's design, so URLs are never logged or shown and every error is generic; a test
  asserts the key never appears in any error.
- **Credentials** are stored in the OS credential store under a separate `.steam` service and never returned to
  the interface.
- **Private profiles.** Steam answers with an empty response, which is reported with instructions
  (Game details must be Public), and distinguished from a genuinely empty library.
- **State.** The loaded library is held in Rust and the interface sends only app IDs back, so the frontend cannot
  supply metadata or cover URLs. Cover ids are validated by the existing IGDB image-id check.
- **Import** runs in groups of ten from the interface, so progress and Stop are simple, and each game is
  independent: one failure does not stop the others. A failed cover download still adds the game.
- Games get platform Steam (the seeded built-in), media type Digital, status Not Started (or Backlog for
  never-played games when chosen), and an optional account label. The release date comes from the game's PC, Mac or
  Linux release; a game that lists other platforms still imports.

## Automated results

- `cargo test`: 113 passed (37 new: 29 Steam, 8 IGDB matching).
  - Profile parsing (IDs, links, custom names, hostile links, look-alike hosts, credentials in URLs) and API key
    validation.
  - Response parsing (private vs empty, duplicates, missing or odd fields, control characters, long names).
  - The HTTP client against a mock server: exact query parameters, vanity resolution, and failures (401, 403, 429,
    5xx, unreachable, unreadable body) with the key never in an error message.
  - IGDB matching: query shape, source lookup and caching, batching (50/50/20), no request for an empty list,
    base game preferred over bundles, malformed rows skipped (this found and fixed a real gap: a row without a
    `uid` used to fail the whole response).
  - Duplicate rules, record building, and saving to a real database: never-overwrite, same game twice in one
    import, failed cover still adds, cleanup of a downloaded cover when saving fails, Backlog for unplayed games
    only, account label.
- Mutation checks (each made a test fail): duplicate check ignoring the platform, private profile treated as empty,
  import not skipping existing games.
- `npm test`: 69 passed (6 new for the selection, filter, grouping and summary helpers).
- `npm run test:ui`: 90 passed (25 new for Steam): setup and Settings, review, disabled duplicates, filtering and
  bulk select, groups of ten, backlog and account options, stale duplicates skipped, cover and per-game failures,
  Stop, an error partway through, navigation locked during load and import, private-profile message and retry,
  IGDB unavailable notice, cache cleared on leaving. Two older IGDB Settings tests were scoped to their own section
  because Settings now has two "Test connection" buttons.
- `cargo fmt --check`, `cargo clippy --all-targets -D warnings`, `npm run build` pass.

## Not verified (important)

- **Real Steam and real IGDB.** No API keys were available. The Steam endpoints and response shapes, and IGDB's
  `external_game_sources` and `external_games` fields, were taken from web search summaries and community
  sources because the official documentation sites blocked automated access. If any assumption is wrong the
  failure should be visible, not silent: a wrong IGDB source id means "0 matched on IGDB" in the review header
  (games are still importable with Steam titles); a wrong Steam response shape gives an error message.
- The Steam tip that any domain name works when creating an API key comes from general knowledge.
- The native window and real credential storage for the Steam settings (the IGDB tests cover the same store).
- Large libraries: matching takes about 0.3 seconds per 50 games because of IGDB's request pacing, so a
  3,000-game library takes roughly 20 seconds; not measured.
- Windows.

## First real run (suggested)

Settings: save IGDB credentials (the Mac keychain is separate from Windows), save the Steam key and profile, use
Test connection. Then Add Game > Import from Steam and check the review header for the matched count before importing.

## Not included

GOG, PlayStation, Nintendo and Xbox import; updating existing games; playtime or achievements; importing DLC or
software filtering (Steam returns some non-game software, which can be deselected in the review).
