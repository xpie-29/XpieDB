# Plan: collections beyond games, guide files, Internet Archive

Design only. No code has been written for anything in this document.

## Part 1. Games, Guides and Hardware as separate collections

### Recommended data model

Three new tables beside `games`. Games stay exactly as they are, so nothing about the current Library changes.
Shared concepts are shared by **columns of the same names and a common photos/tags mechanism**, not by merging
everything into one giant table.

```
hardware(
  id, kind TEXT  -- 'system' | 'accessory'
  name, platform_id NULL -> platforms, manufacturer, model, region, color, serial,
  condition, completeness (boxed / loose / ...), status (Owned / Sold / Gifted / Lost),
  purchase_date, purchase_price, purchase_source, sale_date, sale_price,
  notes_html, date_added, date_modified,
  parent_id NULL -> hardware(id) ON DELETE SET NULL   -- accessory's main system
)
hardware_compat(accessory_id -> hardware, platform_id -> platforms)   -- "also works with"
guides(
  id, title, game_id NULL -> games ON DELETE SET NULL, platform_id NULL,
  publisher, author, edition, isbn, language, format  -- derived, see below
  has_physical, condition, purchase_date, purchase_price, purchase_source,
  notes_html, date_added, date_modified
)
guide_files(id, guide_id -> guides ON DELETE CASCADE, file_name, kind 'pdf'|'epub',
            stored_path, size_bytes, sha256, source_url NULL, date_added)
photos(id, owner_type 'game'|'guide'|'hardware', owner_id, path, caption, sort_order)
```

Guide format is not a column: "physical" = `has_physical`, "digital" = at least one `guide_files` row, "both" =
both. That makes "physical, digital or both" fall out of the data and cannot disagree with it.

Suggested fields per type (beyond the shared ones):

| | Specific fields |
|---|---|
| Games (existing) | unchanged; later could gain condition/purchase info, which is a separate decision |
| Guides | linked game, edition (Collector's, Prima, Future Press), author/publisher, ISBN, page count, language |
| Hardware | system vs accessory, manufacturer/model, region, serial, color/edition, completeness (box, manual, cables), modded yes/no, working yes/no |

**Shared pieces.** Condition, purchase info and notes use the same names and the same editor/components on all
three screens. Photos become one table with an owner type; games keep `cover_path` for now (no migration risk)
and can adopt `photos` later. Tags: reuse the existing `tags` table with one join table per collection.

### Hardware parent/child

A self-reference on one table (`parent_id`) rather than two tables. Reasons: accessories and systems share almost
every field; one list, one search, one set of reports; moving an accessory to a different system is one field.
Constraints enforced in Rust (like the backlog invariant): a system has no parent; an accessory's parent must be a
system; no cycles (impossible with the depth limit of one).

Alternative considered: separate `systems` and `accessories` tables. Cleaner types, but duplicated forms, lists,
photos and search, and "a controller that is also a system" cases (a handheld, a Switch Pro Controller you later
use as a PC pad) get awkward. Rejected.

### Questions you asked

**Nested or flat in the Hardware list?** Recommend **grouped with expand/collapse as the default, plus a
"Flat" toggle** that shows every row with a "Parent" column. Grouped is how you think about a collection (a PS5 and its
four controllers); flat is better for sorting by purchase price or searching "controller". A search or sort
automatically flattens, and when a search matches an accessory only, its parent row is shown dimmed above it so the
match has context.

**Parent not owned, or accessory used by several systems.** Two separate fields cover both:
- `parent_id` is optional. An accessory with no parent sits in a "Loose accessories" group. Nothing forces you to
  own the system.
- `hardware_compat` lists extra platforms it works with (a pad that works with PC and Switch). `platform_id`
  is the primary one. If you own several compatible systems, the accessory still has one parent (where it lives or
  is mainly used), but its detail view and each compatible system's detail view show it under "Also works with".
  Only one parent keeps the list unambiguous and avoids double counting in totals.

**Deleting or selling the parent.**
- *Selling* is a status change, not a delete: the system's status becomes Sold with a date and price. Its accessories
  stay and the app asks, per accessory, "Sold with it / Keep" (default Keep nothing is silently changed). Kept
  accessories become loose, remembering the former parent's name in a read-only note.
- *Deleting* never deletes accessories. The confirm dialog says "N accessories will become loose" and lists them.
  The schema enforces this with `ON DELETE SET NULL`.
- Backup and restore need no special case because it is all one SQLite file.

### Games and guides link

`guides.game_id` (many guides per game, since a guide can exist for several editions). The Game detail panel shows
a "Guides (2)" row with jump links; the Library list/grid shows a small book icon only when at least one guide is
linked. Deleting a game leaves the guide, unlinked, because you may still own the book. A guide for a game you do
not own is allowed (`game_id` NULL plus a free-text "Game" title).

### UI

A top-level switcher, **Games | Guides | Hardware**, above the existing toolbar. Each has its own grid/list, search,
filters, sort, Statistics (optional) and detail panel. Remembered scroll and column widths are per collection
(preference keys prefixed by collection). Backlog, IGDB import and Steam import are Games-only and hide elsewhere.
The new list view reuses the resizable-column component being built now.

### Migration of existing data

Purely additive, the existing library is not rewritten.
1. Migration 5: create `hardware`, `hardware_compat`, `guides`, `guide_files`, `photos`, plus indexes. Existing
   tables untouched, so the app and old backups still work (older backups restore forward as today).
2. Preferences: new allow-listed key `collection` (default `games`); existing keys keep meaning "games".
3. Rollback test like migrations 2 to 4. Backups made by the new version are refused by older versions, as designed.
4. The 20 built-in platforms are reused for hardware (PS5 platform for a PS5 console). No data move.
5. One decision for you: your existing platforms with games, like Steam (363 games) and PC (1), are not hardware.
   The hardware list starts empty; nothing is auto-created from platforms.

### Trade-offs against alternatives

| Option | For | Against |
|---|---|---|
| **Recommended: three tables, shared components** | Games untouched, each type has honest fields, small migration | Some duplicated column definitions |
| One `items` table with a type column and JSON for extras | Fewest tables, one list | Weak typing, awkward filters/reports, nullable-column mess, risky rewrite of all game code |
| Tag-based (everything is a game with a tag) | Zero schema work | Clutters the games view, wrong fields (play status on a controller) |
| Separate app/database per collection | Total isolation | No links between game and guide, three apps to maintain |

### Suggested build order, if approved
1. Collection switcher plus empty Hardware list and form (systems only).
2. Accessories, parent picker, compat, grouped list.
3. Guides plus game links and the book indicator.
4. Photos table. 5. Reports and statistics per collection.

## Part 2. Guide files and Internet Archive

### A. Attaching PDF/ePub

**Copy or link?** Recommend **copy into the app's folder** (`guides/` under the app data folder, named by content
hash, original file name kept in the database), with an optional "move instead of copy" later. Why: it matches how
covers already work ("Rust owns files"), backups can include them, the book survives you moving or renaming
originals, and it keeps the frontend from ever supplying filesystem paths. Cost: disk space (guides are often 50 to
300 MB each) and backups get big, so I propose a setting "Include guide files in backups" defaulting to off, with
a size shown before you choose. Linking is simpler but breaks silently when a file moves, so I would not offer it.

**Open in-app or default reader?** Recommend **default reader** (`open` on Mac, shell open on Windows), triggered
by a Rust command taking only the guide file id. Reasons: reliable PDF and ePub rendering is a large project (ePub
especially), your system reader already handles bookmarks, search and large scans, and no new dependency or
security surface. A built-in PDF preview could be considered later. Files are validated by extension and
magic bytes (`%PDF`, ZIP for ePub) at attach time.

### B. Internet Archive lookup

**What the API supports** (checked today with a live read-only search, not only from documentation):
- Search: `https://archive.org/advancedsearch.php?q=...&fl[]=identifier&fl[]=title&fl[]=format&fl[]=collection&rows=N&output=json`
  returns JSON, supports field queries such as `title:(...) AND mediatype:texts` and `collection:`.
- Item details and file list: `https://archive.org/metadata/<identifier>` (files with name, format, size, md5).
- Download: `https://archive.org/download/<identifier>/<file name>`, a plain HTTPS GET for open items.
- No key needed for these. There is no published hard rate limit, so the app should send one request at a time,
  identify itself with a User-Agent, and cache results.

**Matching reliability.** Fair to poor if automatic, good if reviewed. Titles are user-uploaded and inconsistent:
"Metaphor ReFantazio Digital Artbook" and a manual for a different item both turned up in a live test for one
query, and there is no platform field (platform appears, if at all, in the title or a collection such as
`manuals`). Plan: query on normalized title (strip punctuation, edition words), restrict to `mediatype:texts`,
score by title similarity and platform word hits, show the top results with title, size, formats and a link to
the item page, and never download without a click. This is why I agree with a per-game "Find guides" action and
no bulk scan.

**Borrow-only items.** Many game guides are in the lending library ("inlibrary" / "printdisabled"). Those carry
formats like "LCP Encrypted EPUB" and restricted-access flags; the files cannot be fetched as a normal download
(they return an authorization error), and borrowing needs an Archive account and a reader that handles their DRM.
The app should detect these before offering a download and show them as **"Borrow only"** with an "Open on
archive.org" button, never trying to bypass the restriction, and never asking for or storing your Archive
password. Downloadable results show size and format, and you choose PDF or ePub.

**Other constraints.** The Archive is a third party, so the feature needs an offline-safe failure message and a
visible source link saved on the guide (`guide_files.source_url`). Copyright status of an item is the
uploader's claim; the app should make clear that it lists what the Archive offers and you decide what to
download. This feature follows the add-only rule: it only adds a file to a guide, never edits existing guides.

### Decisions (confirmed by the owner)
1. Hardware list defaults to grouped, with a Flat toggle.
2. Guide files are not included in backups by default.
3. Selling a system asks per accessory.
4. Build order above is still awaiting approval before any work starts.

## Part 3. An in-app guide reader (feasibility, asked 2026-10-04)

**Short answer: yes, it is feasible, and the building blocks are open source.** The recommended path is to
keep "open in your default reader" (built now) and add an in-app reader as a separate, later stage that can reuse
the same stored files.

### Building blocks (licences and activity checked on npm on 2026-10-04)

| Need | Library | Licence | Notes |
|---|---|---|---|
| PDF | **PDF.js** (`pdfjs-dist` 6.4, Mozilla) | Apache-2.0 | Updated this month. The engine behind Firefox's reader: page rendering, text layer (selection, search), outline, zoom, range requests for big files. Ships a ready-made viewer page, but its look is Firefox's, so a custom toolbar over the API is better. |
| PDF in React | `react-pdf` 11 (wrapper over PDF.js) | MIT | Optional convenience; we would still write our own controls. |
| ePub | **foliate-js** 1.0 (the engine of the Foliate reader) | MIT | Paginated or scrolling layout, themes and fonts, table of contents, search, position as an ePub CFI; also reads MOBI/KF8/FB2/CBZ. Small (about 375 KB). Plain web code, not React. |
| ePub, alternative | **Readium** `@readium/navigator` 2.11 | BSD-3 | Industry toolkit (used by Thorium); actively maintained, heavier, more standards-complete. |
| ePub, older | `epubjs` 0.3.93 | BSD-2 | Popular but last released in 2023; I would avoid starting new work on it. |

There is no single plug-in that is both a PDF and an ePub reader with a finished look. The realistic design is one
reader window with two engines behind the same toolbar: PDF.js for `.pdf`, foliate-js (or Readium) for `.epub`.

### What it would take

- **Looks like part of the app:** our own toolbar and side panel in the existing Fluent theme, light and dark. PDF
  pages are images, so dark mode is a CSS inversion option ("night mode") rather than true re-colouring; ePub text
  recolours properly.
- **Reader controls:** page next/previous and jump, zoom and fit width/page, two-page spread, thumbnails, table
  of contents (a PDF's own outline when it has one, an ePub's TOC), search, text selection and copy, font size and
  theme for ePub. Remember the last position per file and resume there.
- **Bookmarks:** easy, because we own the database. A `guide_bookmarks` table (file, location, label, date):
  location is a page number for PDF and a CFI for ePub. A bookmarks panel and "resume where I stopped" come with it.
- **Full screen:** the browser Fullscreen API, or Tauri's window fullscreen call.
- **Pop-out window:** Tauri 2 supports extra windows, so the reader can open in its own window (for a second
  monitor) or stay inside the main window as a full-pane mode. Both talk to the same backend commands, so a
  pop-out reader can still list your guides.
- **A guide library inside the reader:** a side panel listing guides (all, or for the game you are reading about)
  to switch without closing the reader. The data is already local; this is a UI panel plus "recently opened".
- **Serving big files safely:** guides can be 50 to 300 MB. Do not pass them through IPC as base64. Register a
  custom URL scheme in Rust that serves a guide file by id with range requests (PDF.js loads pages on demand that
  way). The frontend still never supplies a path.
- **Security settings to loosen carefully:** the app's content policy needs a worker allowance for PDF.js and the
  custom scheme for files, and nothing else.

### Limits and risks

- **Scans:** many Internet Archive PDFs are page photographs with no text; they read fine but search and copy only
  work if the file has an OCR text layer (the Archive often offers one).
- **Borrow-only items** from the Archive are DRM-encrypted ("LCP"); no reader can open them, so they stay
  "Open on archive.org".
- **ePub variety:** fixed-layout and badly built ePubs render unevenly in every engine.
- **Effort:** roughly the size of the Hardware work: a PDF reader with bookmarks and resume, an ePub reader on
  the same toolbar, the file-serving scheme, then pop-out and the in-reader guide list. I would build it in that
  order, each step usable on its own.
- **No new network access** is needed; everything runs locally and offline.

### Recommendation

Finish file storage and "open in default reader" first (done), then the Internet Archive lookup, then decide on
the reader with real guides in hand. If you want the reader sooner, start with the PDF half, since guides are
mostly PDFs.

### Status (2026-10-05)
Built: the PDF half, inside the main window (PDF.js with our own toolbar; ranged loading through a `guidefile` scheme;
zoom, search, contents, bookmarks, resume, night mode, full screen, switching between guides). Still to do: ePub
(foliate-js), a pop-out reader window, and optionally thumbnails and two-page spreads.
