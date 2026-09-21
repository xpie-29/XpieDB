-- Manual order of the games whose play status is Backlog. NULL when a game is
-- not in the backlog; otherwise 1, 2, 3... with no gaps (maintained in Rust).
ALTER TABLE games ADD COLUMN backlog_position INTEGER
    CHECK (backlog_position IS NULL OR backlog_position >= 1);
