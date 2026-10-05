-- Digital copies of guides (PDF or ePub). The file itself is copied into the app's guide-files folder
-- under a random name (stored_name); file_name is only what to show. Rows go when their guide goes, and
-- Rust removes the files. Guide files are not part of backups unless the owner chooses that.
CREATE TABLE guide_files (
    id INTEGER PRIMARY KEY,
    guide_id INTEGER NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL CHECK (length(trim(file_name)) > 0),
    kind TEXT NOT NULL CHECK (kind IN ('pdf', 'epub')),
    stored_name TEXT NOT NULL UNIQUE,
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
    sha256 TEXT NOT NULL,
    source_url TEXT,
    date_added TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (guide_id, sha256)
);
CREATE INDEX guide_files_guide ON guide_files(guide_id);
