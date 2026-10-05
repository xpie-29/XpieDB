-- Hardware collection: consoles/PCs ("system") and their accessories. An accessory may point at a
-- parent system; that link is cleared (never the accessory deleted) when the system goes away.
-- Rust enforces the rest: a parent is always a system, systems have no parent, accessories only
-- list extra compatible platforms.
CREATE TABLE hardware (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('system', 'accessory')),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    platform_id INTEGER REFERENCES platforms(id) ON DELETE RESTRICT,
    parent_id INTEGER REFERENCES hardware(id) ON DELETE SET NULL,
    former_parent_name TEXT,
    manufacturer TEXT, model TEXT, region TEXT, serial TEXT, color TEXT,
    condition TEXT, completeness TEXT,
    status TEXT NOT NULL DEFAULT 'Owned' CHECK (status IN ('Owned', 'Sold', 'Gifted', 'Lost')),
    is_working INTEGER NOT NULL DEFAULT 1 CHECK (is_working IN (0, 1)),
    is_modded INTEGER NOT NULL DEFAULT 0 CHECK (is_modded IN (0, 1)),
    purchase_date TEXT, purchase_price_cents INTEGER CHECK (purchase_price_cents IS NULL OR purchase_price_cents >= 0),
    purchase_source TEXT,
    sale_date TEXT, sale_price_cents INTEGER CHECK (sale_price_cents IS NULL OR sale_price_cents >= 0),
    photo_path TEXT,
    notes_html TEXT NOT NULL DEFAULT '',
    date_added TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    date_modified TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (kind = 'accessory' OR parent_id IS NULL)
);
CREATE INDEX hardware_parent ON hardware(parent_id);
CREATE INDEX hardware_platform ON hardware(platform_id);
-- Extra platforms an accessory works with, beyond its primary platform.
CREATE TABLE hardware_compat (
    hardware_id INTEGER NOT NULL REFERENCES hardware(id) ON DELETE CASCADE,
    platform_id INTEGER NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    PRIMARY KEY (hardware_id, platform_id)
);
