# Changelog

## Milestone 3 - 2026-09-15

- Added a dedicated Library utility bar with immediate local structured-field search.
- Added Platform, Account, Play Status, Genre, Tag, and Media Type filters with AND semantics.
- Added nine persistent sort orders and Clear All Filters that preserves presentation settings.
- Kept inspector selection synchronized with results and distinguished no results from an empty library.
- Added Ctrl+F search focus, active-filter feedback, result counts, and 40 query regression tests.
- Retained the existing shell, database schema, notes, covers, and dependency versions.

## Milestone 2.5 - 2026-09-15

- Replaced the left rail with a compact primary toolbar and right-side presentation controls.
- Added shared Grid/List selection and a fixed independently scrolling detail inspector.
- Added nullable free-text Account through transactional migration 3, preserving old records.
- Added reusable accessible stars with hover, keyboard operation, clearing, and read-only display.
- Removed platform-mark frames and normalized compact alignment without external assets.
- Preserved editing, notes, covers, tags, and preferences; added Account migration/regression tests.
- Prepared an optional utility-bar slot without adding search, filtering, Stats, or IGDB.

## Milestone 2 - 2026-09-15

- Added transactional local-library schema with games, platforms, tags, and preferences.
- Added offline manual CRUD, dedicated detail view, and explicit edit cancellation.
- Added Cover Grid, Compact List, and four persistent cover sizes.
- Seeded 20 built-in platforms and added custom platform/icon management.
- Added Tiptap rich-text notes, Rust HTML sanitization, and safe external hyperlinks.
- Added validated managed JPEG/PNG/WebP imports and reference-aware image cleanup.
- Added temporary-database tests for migrations, CRUD, relationships, notes, preferences, and images.

## 0.1.0 - 2026-09-15

- Scaffolded the GameVault Tauri 2, React, TypeScript, Vite, and Fluent UI foundation.
- Added Rust application-data directory handling.
- Added SQLite setup with a migration mechanism using bundled `rusqlite`.
- Added a basic dark Windows-style application shell for the Library, Add Game, and Settings destinations.
- Added required application icon assets for Windows compilation and packaging.
- Added a migration regression test for repeatable setup and data preservation.
- Expanded local-data and credential ignore rules and wrapped long sidebar paths.
