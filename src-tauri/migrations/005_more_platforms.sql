-- Fifteen more built-in platforms (handhelds, Xbox One, Steam Deck and the Sega consoles), and a
-- manufacturer-grouped sort order for all built-ins. Existing platform ids never change.
-- If the owner already made a custom platform with one of these names, it is kept (same id, icon and
-- short name, so its games are untouched) and simply becomes a built-in.
INSERT INTO platforms (name, short_name, sort_order, is_builtin) VALUES
('PlayStation Portable', 'PSP', 0, 1), ('PlayStation Vita', 'Vita', 0, 1),
('Game Boy', 'GB', 0, 1), ('Game Boy Color', 'GBC', 0, 1),
('Game Boy Advance', 'GBA', 0, 1), ('Nintendo DS', 'DS', 0, 1),
('Virtual Boy', 'VB', 0, 1), ('Xbox One', 'XB1', 0, 1),
('Steam Deck', 'Deck', 0, 1), ('Sega Master System', 'SMS', 0, 1),
('Sega Genesis / Mega Drive', 'MD', 0, 1), ('Sega CD', 'SCD', 0, 1),
('Sega 32X', '32X', 0, 1), ('Sega Saturn', 'SAT', 0, 1),
('Game Gear', 'GG', 0, 1)
ON CONFLICT(name) DO UPDATE SET is_builtin = 1;

-- Grouped by maker, oldest first. Custom platforms keep sort_order 100 and stay last.
WITH ordered(name, position) AS (VALUES
 ('Nintendo Entertainment System', 1), ('Super Nintendo', 2), ('Nintendo 64', 3), ('GameCube', 4),
 ('Wii', 5), ('Wii U', 6), ('Nintendo Switch', 7), ('Nintendo Switch 2', 8),
 ('Virtual Boy', 9), ('Game Boy', 10), ('Game Boy Color', 11), ('Game Boy Advance', 12),
 ('Nintendo DS', 13), ('Nintendo 3DS', 14),
 ('PlayStation', 15), ('PlayStation 2', 16), ('PlayStation 3', 17), ('PlayStation 4', 18),
 ('PlayStation 5', 19), ('PlayStation Portable', 20), ('PlayStation Vita', 21),
 ('Xbox', 22), ('Xbox 360', 23), ('Xbox One', 24), ('Xbox Series S/X', 25),
 ('Sega Master System', 26), ('Sega Genesis / Mega Drive', 27), ('Sega CD', 28), ('Sega 32X', 29),
 ('Sega Saturn', 30), ('Dreamcast', 31), ('Game Gear', 32),
 ('Steam', 33), ('Steam Deck', 34), ('PC', 35))
UPDATE platforms
   SET sort_order = (SELECT position FROM ordered WHERE ordered.name = platforms.name COLLATE NOCASE)
 WHERE name IN (SELECT name FROM ordered);
