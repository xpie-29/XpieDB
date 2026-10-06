-- A game the owner has hidden from the Library, Backlog and Reports. Hiding keeps every other field,
-- its backlog place and its guides; it only changes where the game is shown.
ALTER TABLE games ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1));
