-- In-app reader: where the owner stopped in each file, and their bookmarks. Both go with the file.
ALTER TABLE guide_files ADD COLUMN last_page INTEGER CHECK (last_page IS NULL OR last_page >= 1);
ALTER TABLE guide_files ADD COLUMN last_opened_at TEXT;
CREATE TABLE guide_bookmarks (
    id INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES guide_files(id) ON DELETE CASCADE,
    page INTEGER NOT NULL CHECK (page >= 1),
    label TEXT NOT NULL CHECK (length(trim(label)) > 0),
    date_added TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (file_id, page)
);
CREATE INDEX guide_bookmarks_file ON guide_bookmarks(file_id);
