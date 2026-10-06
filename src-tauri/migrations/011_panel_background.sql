-- How a game's details panel is backed: the default gray, its cover art, or the owner's own image
-- (a managed image in the covers folder) with a placement. Only changes how the panel looks.
ALTER TABLE games ADD COLUMN panel_bg TEXT NOT NULL DEFAULT 'default'
    CHECK (panel_bg IN ('default', 'cover', 'image'));
ALTER TABLE games ADD COLUMN panel_bg_image TEXT;
ALTER TABLE games ADD COLUMN panel_bg_fit TEXT NOT NULL DEFAULT 'fill'
    CHECK (panel_bg_fit IN ('fill', 'fit', 'stretch', 'center', 'tile'));
