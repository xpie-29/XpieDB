-- Guides (strategy guides, manuals, artbooks...), optionally linked to a game in the Library.
-- Deleting a game never deletes its guides: the link is cleared and Rust copies the game's title into
-- game_title first, so the guide still says which game it was for.
CREATE TABLE guides (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
    game_title TEXT,
    platform_id INTEGER REFERENCES platforms(id) ON DELETE RESTRICT,
    author TEXT, publisher TEXT, edition TEXT, isbn TEXT, language TEXT,
    page_count INTEGER CHECK (page_count IS NULL OR page_count > 0),
    has_physical INTEGER NOT NULL DEFAULT 1 CHECK (has_physical IN (0, 1)),
    condition TEXT,
    purchase_date TEXT,
    purchase_price_cents INTEGER CHECK (purchase_price_cents IS NULL OR purchase_price_cents >= 0),
    purchase_source TEXT,
    photo_path TEXT,
    notes_html TEXT NOT NULL DEFAULT '',
    date_added TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    date_modified TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX guides_game ON guides(game_id);
CREATE INDEX guides_platform ON guides(platform_id);
