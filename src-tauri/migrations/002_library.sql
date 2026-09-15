CREATE TABLE platforms (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    short_name TEXT NOT NULL,
    icon_path TEXT,
    sort_order INTEGER NOT NULL DEFAULT 100,
    is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1))
);
INSERT INTO platforms (name, short_name, sort_order, is_builtin) VALUES
('Nintendo Entertainment System', 'NES', 1, 1),
('Super Nintendo', 'SNES', 2, 1), ('Nintendo 64', 'N64', 3, 1),
('GameCube', 'GC', 4, 1), ('Wii', 'Wii', 5, 1), ('Wii U', 'Wii U', 6, 1),
('Nintendo Switch', 'NS', 7, 1), ('Nintendo Switch 2', 'NS2', 8, 1),
('Nintendo 3DS', '3DS', 9, 1), ('PlayStation', 'PS', 10, 1),
('PlayStation 2', 'PS2', 11, 1), ('PlayStation 3', 'PS3', 12, 1),
('PlayStation 4', 'PS4', 13, 1), ('PlayStation 5', 'PS5', 14, 1),
('Xbox', 'XB', 15, 1), ('Xbox 360', '360', 16, 1),
('Xbox Series S/X', 'XS', 17, 1), ('Steam', 'STM', 18, 1),
('PC', 'PC', 19, 1), ('Dreamcast', 'DC', 20, 1);
CREATE TABLE games (
    id INTEGER PRIMARY KEY,
    igdb_id INTEGER,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    platform_id INTEGER NOT NULL REFERENCES platforms(id) ON DELETE RESTRICT,
    release_date TEXT, genre TEXT, developer TEXT, publisher TEXT, cover_path TEXT,
    media_type TEXT NOT NULL DEFAULT 'Physical',
    play_status TEXT NOT NULL DEFAULT 'Not Started',
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    notes_html TEXT NOT NULL DEFAULT '',
    date_added TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    date_modified TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX games_platform ON games(platform_id);
CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE);
CREATE TABLE game_tags (
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (game_id, tag_id)
);
CREATE INDEX game_tags_tag ON game_tags(tag_id);
CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO preferences VALUES ('library_view', 'grid'), ('cover_size', 'medium');
