//! The Hardware collection: systems (consoles, PCs, handhelds) and their accessories.
//!
//! Rules enforced here (the schema enforces the simple ones too):
//! - an accessory may have one parent, which must be a system; systems never have a parent;
//! - an accessory can list extra compatible platforms; systems cannot;
//! - deleting a system, or moving it out of "Owned", never deletes its accessories: they are either
//!   marked as going with it or become loose, remembering the former parent's name.
use crate::catalog::{Result, clean_optional_field, sanitize_notes, valid_date};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};

pub const KINDS: [&str; 2] = ["system", "accessory"];
pub const STATUSES: [&str; 4] = ["Owned", "Sold", "Gifted", "Lost"];
pub const CONDITIONS: [&str; 6] = ["New", "Like New", "Good", "Fair", "Poor", "For Parts"];
pub const COMPLETENESS: [&str; 3] = ["Complete in box", "Missing box or manual", "Loose"];
const MAX_CENTS: i64 = 1_000_000_000;

fn db(error: rusqlite::Error) -> String {
    format!("The library could not be updated: {error}")
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct HardwareInput {
    pub kind: String,
    pub name: String,
    pub platform_id: Option<i64>,
    pub parent_id: Option<i64>,
    pub manufacturer: Option<String>,
    pub model: Option<String>,
    pub region: Option<String>,
    pub serial: Option<String>,
    pub color: Option<String>,
    pub condition: Option<String>,
    pub completeness: Option<String>,
    pub status: String,
    pub is_working: bool,
    pub is_modded: bool,
    pub purchase_date: Option<String>,
    pub purchase_price_cents: Option<i64>,
    pub purchase_source: Option<String>,
    pub sale_date: Option<String>,
    pub sale_price_cents: Option<i64>,
    pub photo_path: Option<String>,
    pub notes_html: String,
    /// Extra platforms an accessory works with (besides `platform_id`).
    pub compat_platform_ids: Vec<i64>,
}
#[derive(Debug, Serialize)]
pub struct Hardware {
    pub id: i64,
    #[serde(flatten)]
    pub data: HardwareInput,
    /// Set when the accessory's system was deleted or kept while the system went away.
    pub former_parent_name: Option<String>,
    pub date_added: String,
    pub date_modified: String,
}

fn one_of(value: &Option<String>, allowed: &[&str], what: &str) -> Result<()> {
    if value.as_deref().is_some_and(|v| !allowed.contains(&v)) {
        return Err(format!("Choose a valid {what}."));
    }
    Ok(())
}
fn validate(input: &mut HardwareInput) -> Result<()> {
    if !KINDS.contains(&input.kind.as_str()) {
        return Err("Choose whether this is a system or an accessory.".into());
    }
    input.name = input.name.trim().into();
    if input.name.is_empty() || input.name.len() > 300 {
        return Err("Enter a name of 1 to 300 characters.".into());
    }
    if !STATUSES.contains(&input.status.as_str()) {
        return Err("Choose a valid status.".into());
    }
    for value in [
        &mut input.manufacturer,
        &mut input.model,
        &mut input.region,
        &mut input.serial,
        &mut input.color,
        &mut input.purchase_source,
        &mut input.condition,
        &mut input.completeness,
        &mut input.purchase_date,
        &mut input.sale_date,
    ] {
        clean_optional_field(value)?;
    }
    one_of(&input.condition, &CONDITIONS, "condition")?;
    one_of(&input.completeness, &COMPLETENESS, "completeness")?;
    for date in [&input.purchase_date, &input.sale_date]
        .into_iter()
        .flatten()
    {
        if !valid_date(date) {
            return Err("Use valid dates (YYYY-MM-DD).".into());
        }
    }
    for cents in [input.purchase_price_cents, input.sale_price_cents]
        .into_iter()
        .flatten()
    {
        if !(0..=MAX_CENTS).contains(&cents) {
            return Err("Enter a price between 0 and 10,000,000.".into());
        }
    }
    if input.status == "Owned" {
        // A sale only means something once the item is no longer owned.
        input.sale_date = None;
        input.sale_price_cents = None;
    }
    if input.notes_html.len() > 100_000 {
        return Err("Notes are too long (maximum 100 KB).".into());
    }
    input.notes_html = sanitize_notes(&input.notes_html);
    if input.kind == "system" {
        input.parent_id = None;
        input.compat_platform_ids.clear();
    }
    Ok(())
}
fn exists(c: &Connection, sql: &str, id: i64) -> Result<bool> {
    c.query_row(sql, [id], |r| r.get(0)).map_err(db)
}

const COLUMNS: &str = "id,kind,name,platform_id,parent_id,manufacturer,model,region,serial,color,\
    condition,completeness,status,is_working,is_modded,purchase_date,purchase_price_cents,\
    purchase_source,sale_date,sale_price_cents,photo_path,notes_html,former_parent_name,\
    date_added,date_modified";

fn row(r: &rusqlite::Row) -> rusqlite::Result<Hardware> {
    Ok(Hardware {
        id: r.get(0)?,
        data: HardwareInput {
            kind: r.get(1)?,
            name: r.get(2)?,
            platform_id: r.get(3)?,
            parent_id: r.get(4)?,
            manufacturer: r.get(5)?,
            model: r.get(6)?,
            region: r.get(7)?,
            serial: r.get(8)?,
            color: r.get(9)?,
            condition: r.get(10)?,
            completeness: r.get(11)?,
            status: r.get(12)?,
            is_working: r.get(13)?,
            is_modded: r.get(14)?,
            purchase_date: r.get(15)?,
            purchase_price_cents: r.get(16)?,
            purchase_source: r.get(17)?,
            sale_date: r.get(18)?,
            sale_price_cents: r.get(19)?,
            photo_path: r.get(20)?,
            notes_html: sanitize_notes(&r.get::<_, String>(21)?),
            compat_platform_ids: vec![],
        },
        former_parent_name: r.get(22)?,
        date_added: r.get(23)?,
        date_modified: r.get(24)?,
    })
}
fn compat_map(c: &Connection) -> Result<HashMap<i64, Vec<i64>>> {
    let mut map: HashMap<i64, Vec<i64>> = HashMap::new();
    let mut s = c
        .prepare("SELECT hardware_id,platform_id FROM hardware_compat ORDER BY platform_id")
        .map_err(db)?;
    for pair in s
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))
        .map_err(db)?
    {
        let (hardware, platform) = pair.map_err(db)?;
        map.entry(hardware).or_default().push(platform);
    }
    Ok(map)
}
pub fn get_hardware(c: &Connection, id: i64) -> Result<Hardware> {
    let mut item = c
        .query_row(
            &format!("SELECT {COLUMNS} FROM hardware WHERE id=?1"),
            [id],
            row,
        )
        .optional()
        .map_err(db)?
        .ok_or("This hardware item no longer exists.")?;
    item.data.compat_platform_ids = compat_map(c)?.remove(&id).unwrap_or_default();
    Ok(item)
}
pub fn list_hardware(c: &Connection) -> Result<Vec<Hardware>> {
    let mut compat = compat_map(c)?;
    let mut s = c
        .prepare(&format!(
            "SELECT {COLUMNS} FROM hardware ORDER BY name COLLATE NOCASE,id"
        ))
        .map_err(db)?;
    let rows = s.query_map([], row).map_err(db)?;
    let mut items = Vec::new();
    for item in rows {
        let mut item = item.map_err(db)?;
        item.data.compat_platform_ids = compat.remove(&item.id).unwrap_or_default();
        items.push(item);
    }
    Ok(items)
}

/// Creates or updates an item.
///
/// `with_accessories` only matters when a system leaves "Owned" in this save: the listed
/// accessories (which must belong to it) go with it, and every other accessory becomes loose.
pub fn save_hardware(
    c: &Connection,
    id: Option<i64>,
    mut input: HardwareInput,
    with_accessories: &[i64],
) -> Result<Hardware> {
    validate(&mut input)?;
    let tx = c.unchecked_transaction().map_err(db)?;
    if let Some(platform) = input.platform_id
        && !exists(
            &tx,
            "SELECT EXISTS(SELECT 1 FROM platforms WHERE id=?)",
            platform,
        )?
    {
        return Err("Choose an existing platform.".into());
    }
    let compat: BTreeSet<i64> = input
        .compat_platform_ids
        .iter()
        .copied()
        .filter(|p| Some(*p) != input.platform_id)
        .collect();
    for platform in &compat {
        if !exists(
            &tx,
            "SELECT EXISTS(SELECT 1 FROM platforms WHERE id=?)",
            *platform,
        )? {
            return Err("Choose existing platforms.".into());
        }
    }
    if let Some(parent) = input.parent_id {
        if Some(parent) == id {
            return Err("An item cannot be its own parent.".into());
        }
        if !exists(
            &tx,
            "SELECT EXISTS(SELECT 1 FROM hardware WHERE id=? AND kind='system')",
            parent,
        )? {
            return Err("An accessory's parent must be a system you have added.".into());
        }
    }
    let previous: Option<(String, String)> = match id {
        Some(id) => Some(
            tx.query_row("SELECT kind,status FROM hardware WHERE id=?", [id], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .optional()
            .map_err(db)?
            .ok_or("This hardware item no longer exists.")?,
        ),
        None => None,
    };
    if let (Some(id), Some((was_kind, _))) = (id, &previous)
        && was_kind == "system"
        && input.kind == "accessory"
        && exists(
            &tx,
            "SELECT EXISTS(SELECT 1 FROM hardware WHERE parent_id=?)",
            id,
        )?
    {
        return Err(
            "Move or detach this system's accessories before changing it to an accessory.".into(),
        );
    }
    let values = params![
        input.kind,
        input.name,
        input.platform_id,
        input.parent_id,
        input.manufacturer,
        input.model,
        input.region,
        input.serial,
        input.color,
        input.condition,
        input.completeness,
        input.status,
        input.is_working,
        input.is_modded,
        input.purchase_date,
        input.purchase_price_cents,
        input.purchase_source,
        input.sale_date,
        input.sale_price_cents,
        input.photo_path,
        input.notes_html,
    ];
    let saved = match id {
        Some(id) => {
            tx.execute(
                "UPDATE hardware SET kind=?1,name=?2,platform_id=?3,parent_id=?4,manufacturer=?5,model=?6,\
                 region=?7,serial=?8,color=?9,condition=?10,completeness=?11,status=?12,is_working=?13,\
                 is_modded=?14,purchase_date=?15,purchase_price_cents=?16,purchase_source=?17,sale_date=?18,\
                 sale_price_cents=?19,photo_path=?20,notes_html=?21,\
                 former_parent_name=CASE WHEN ?4 IS NOT NULL THEN NULL ELSE former_parent_name END,\
                 date_modified=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?22",
                rusqlite::params_from_iter(
                    values
                        .iter()
                        .map(|v| v as &dyn rusqlite::ToSql)
                        .chain([&id as &dyn rusqlite::ToSql]),
                ),
            )
            .map_err(db)?;
            id
        }
        None => {
            tx.execute(
                "INSERT INTO hardware(kind,name,platform_id,parent_id,manufacturer,model,region,serial,color,\
                 condition,completeness,status,is_working,is_modded,purchase_date,purchase_price_cents,\
                 purchase_source,sale_date,sale_price_cents,photo_path,notes_html) \
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)",
                values,
            )
            .map_err(db)?;
            tx.last_insert_rowid()
        }
    };
    tx.execute("DELETE FROM hardware_compat WHERE hardware_id=?", [saved])
        .map_err(db)?;
    for platform in &compat {
        tx.execute(
            "INSERT INTO hardware_compat(hardware_id,platform_id) VALUES (?1,?2)",
            [saved, *platform],
        )
        .map_err(db)?;
    }
    let left_owned = previous
        .as_ref()
        .is_some_and(|(kind, status)| kind == "system" && status == "Owned")
        && input.kind == "system"
        && input.status != "Owned";
    if left_owned {
        let children: Vec<i64> = tx
            .prepare("SELECT id FROM hardware WHERE parent_id=?")
            .map_err(db)?
            .query_map([saved], |r| r.get(0))
            .map_err(db)?
            .collect::<std::result::Result<_, _>>()
            .map_err(db)?;
        if let Some(stray) = with_accessories.iter().find(|a| !children.contains(a)) {
            return Err(format!("Item {stray} is not an accessory of this system."));
        }
        for child in children {
            if with_accessories.contains(&child) {
                // Goes with the system: same outcome, unless it already had its own.
                tx.execute(
                    "UPDATE hardware SET status=?1, sale_date=?2, date_modified=strftime('%Y-%m-%dT%H:%M:%fZ','now') \
                     WHERE id=?3 AND status='Owned'",
                    params![input.status, input.sale_date, child],
                )
                .map_err(db)?;
            } else {
                tx.execute(
                    "UPDATE hardware SET former_parent_name=?1, parent_id=NULL, \
                     date_modified=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2",
                    params![input.name, child],
                )
                .map_err(db)?;
            }
        }
    }
    tx.commit().map_err(db)?;
    get_hardware(c, saved)
}

/// Deletes an item. Its accessories are kept and become loose. Returns its photo, if any,
/// so the caller can remove the file once nothing else uses it.
pub fn delete_hardware(c: &Connection, id: i64) -> Result<Option<String>> {
    let tx = c.unchecked_transaction().map_err(db)?;
    let (name, photo): (String, Option<String>) = tx
        .query_row(
            "SELECT name,photo_path FROM hardware WHERE id=?",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(db)?
        .ok_or("This hardware item no longer exists.")?;
    tx.execute(
        "UPDATE hardware SET former_parent_name=?1, parent_id=NULL, \
         date_modified=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE parent_id=?2",
        params![name, id],
    )
    .map_err(db)?;
    tx.execute("DELETE FROM hardware WHERE id=?", [id])
        .map_err(db)?;
    tx.commit().map_err(db)?;
    Ok(photo)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{assets, catalog, storage};

    fn database() -> (tempfile::TempDir, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let c = Connection::open(dir.path().join("test.db")).unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        storage::run_migrations(&c).unwrap();
        (dir, c)
    }
    fn system(name: &str) -> HardwareInput {
        HardwareInput {
            kind: "system".into(),
            name: name.into(),
            platform_id: Some(14),
            status: "Owned".into(),
            is_working: true,
            ..Default::default()
        }
    }
    fn accessory(name: &str, parent: Option<i64>) -> HardwareInput {
        HardwareInput {
            kind: "accessory".into(),
            name: name.into(),
            platform_id: Some(14),
            parent_id: parent,
            status: "Owned".into(),
            is_working: true,
            ..Default::default()
        }
    }
    fn add(c: &Connection, input: HardwareInput) -> Hardware {
        save_hardware(c, None, input, &[]).unwrap()
    }
    fn err(c: &Connection, id: Option<i64>, input: HardwareInput) -> String {
        save_hardware(c, id, input, &[]).unwrap_err()
    }

    #[test]
    fn every_field_round_trips_and_is_cleaned() {
        let (_dir, c) = database();
        let mut input = system("  PlayStation 5  ");
        input.manufacturer = Some(" Sony ".into());
        input.model = Some("CFI-1215A".into());
        input.region = Some("NTSC-U".into());
        input.serial = Some("  ".into());
        input.color = Some("White".into());
        input.condition = Some("Like New".into());
        input.completeness = Some("Complete in box".into());
        input.is_modded = true;
        input.purchase_date = Some("2024-02-29".into());
        input.purchase_price_cents = Some(49_999);
        input.purchase_source = Some("Best Buy".into());
        input.notes_html = "<p>Disc <script>x</script>edition</p>".into();
        let saved = add(&c, input);
        let again = get_hardware(&c, saved.id).unwrap();
        assert_eq!(again.data.name, "PlayStation 5");
        assert_eq!(again.data.manufacturer.as_deref(), Some("Sony"));
        assert_eq!(again.data.serial, None);
        assert_eq!(again.data.purchase_price_cents, Some(49_999));
        assert_eq!(again.data.purchase_date.as_deref(), Some("2024-02-29"));
        assert!(again.data.is_modded && again.data.is_working);
        assert!(!again.data.notes_html.contains("script"));
        assert_eq!(again.data.notes_html, "<p>Disc edition</p>");
        assert!(again.former_parent_name.is_none());
    }

    #[test]
    fn invalid_values_are_rejected_and_nothing_is_saved() {
        let (_dir, c) = database();
        let parent = add(&c, system("PS5")).id;
        let accessory_id = add(&c, accessory("Pad", Some(parent))).id;
        let bad: Vec<(&str, HardwareInput)> = vec![
            (
                "kind",
                HardwareInput {
                    kind: "gizmo".into(),
                    ..system("X")
                },
            ),
            ("name", system("   ")),
            ("long name", system(&"x".repeat(301))),
            (
                "status",
                HardwareInput {
                    status: "Borrowed".into(),
                    ..system("X")
                },
            ),
            (
                "condition",
                HardwareInput {
                    condition: Some("Shiny".into()),
                    ..system("X")
                },
            ),
            (
                "completeness",
                HardwareInput {
                    completeness: Some("Half".into()),
                    ..system("X")
                },
            ),
            (
                "date",
                HardwareInput {
                    purchase_date: Some("2023-02-30".into()),
                    ..system("X")
                },
            ),
            (
                "sale date",
                HardwareInput {
                    status: "Sold".into(),
                    sale_date: Some("soon".into()),
                    ..system("X")
                },
            ),
            (
                "negative price",
                HardwareInput {
                    purchase_price_cents: Some(-1),
                    ..system("X")
                },
            ),
            (
                "huge price",
                HardwareInput {
                    sale_price_cents: Some(MAX_CENTS + 1),
                    status: "Sold".into(),
                    ..system("X")
                },
            ),
            (
                "platform",
                HardwareInput {
                    platform_id: Some(9999),
                    ..system("X")
                },
            ),
            (
                "compat platform",
                HardwareInput {
                    compat_platform_ids: vec![9999],
                    ..accessory("X", None)
                },
            ),
            ("parent missing", accessory("X", Some(9999))),
            ("parent is an accessory", accessory("X", Some(accessory_id))),
            (
                "long notes",
                HardwareInput {
                    notes_html: "x".repeat(100_001),
                    ..system("X")
                },
            ),
        ];
        for (what, input) in bad {
            assert!(
                save_hardware(&c, None, input, &[]).is_err(),
                "{what} should fail"
            );
        }
        assert_eq!(list_hardware(&c).unwrap().len(), 2);
        // An item cannot be its own parent.
        let msg = err(&c, Some(accessory_id), accessory("Pad", Some(accessory_id)));
        assert!(msg.contains("own parent"), "{msg}");
    }

    #[test]
    fn systems_have_no_parent_or_compatibility_and_accessories_keep_theirs() {
        let (_dir, c) = database();
        let ps5 = add(&c, system("PS5")).id;
        let mut input = system("PC");
        input.parent_id = Some(ps5);
        input.compat_platform_ids = vec![19];
        let pc = add(&c, input);
        assert_eq!(pc.data.parent_id, None);
        assert!(pc.data.compat_platform_ids.is_empty());

        let mut pad = accessory("Controller", Some(ps5));
        // Duplicates collapse and the primary platform is not repeated in the list.
        pad.compat_platform_ids = vec![19, 7, 19, 14];
        let pad = add(&c, pad);
        assert_eq!(pad.data.compat_platform_ids, vec![7, 19]);
        assert_eq!(pad.data.parent_id, Some(ps5));
        // The list carries the same compatibility lists.
        let listed = list_hardware(&c).unwrap();
        let found = listed.iter().find(|h| h.id == pad.id).unwrap();
        assert_eq!(found.data.compat_platform_ids, vec![7, 19]);
        // An accessory with no parent and no platform is allowed (loose, platform unknown).
        let mut loose = accessory("Cable", None);
        loose.platform_id = None;
        assert!(add(&c, loose).data.platform_id.is_none());
    }

    #[test]
    fn owned_items_have_no_sale_but_sold_ones_keep_it() {
        let (_dir, c) = database();
        let mut input = system("PS5");
        input.sale_date = Some("2025-01-01".into());
        input.sale_price_cents = Some(30_000);
        let item = add(&c, input.clone());
        assert!(item.data.sale_date.is_none() && item.data.sale_price_cents.is_none());
        input.status = "Sold".into();
        let sold = save_hardware(&c, Some(item.id), input, &[]).unwrap();
        assert_eq!(sold.data.sale_date.as_deref(), Some("2025-01-01"));
        assert_eq!(sold.data.sale_price_cents, Some(30_000));
    }

    #[test]
    fn changing_kind_is_checked_against_accessories() {
        let (_dir, c) = database();
        let ps5 = add(&c, system("PS5")).id;
        let pad = add(&c, accessory("Pad", Some(ps5))).id;
        let msg = err(&c, Some(ps5), accessory("PS5", None));
        assert!(msg.contains("accessories"), "{msg}");
        assert_eq!(get_hardware(&c, ps5).unwrap().data.kind, "system");
        // An accessory turned into a system drops its parent link.
        let promoted = save_hardware(&c, Some(pad), system("Pad as system"), &[]).unwrap();
        assert_eq!(promoted.data.parent_id, None);
        assert_eq!(promoted.data.kind, "system");
    }

    #[test]
    fn deleting_a_system_keeps_its_accessories_as_loose_ones() {
        let (_dir, c) = database();
        let ps5 = add(&c, system("PlayStation 5")).id;
        let pad = add(&c, accessory("DualSense", Some(ps5))).id;
        let other = add(&c, system("Switch")).id;
        let unrelated = add(&c, accessory("Joy-Con", Some(other))).id;
        delete_hardware(&c, ps5).unwrap();
        let pad = get_hardware(&c, pad).unwrap();
        assert_eq!(pad.data.parent_id, None);
        assert_eq!(pad.former_parent_name.as_deref(), Some("PlayStation 5"));
        // Other families are untouched.
        let joy = get_hardware(&c, unrelated).unwrap();
        assert_eq!(joy.data.parent_id, Some(other));
        assert!(joy.former_parent_name.is_none());
        assert!(delete_hardware(&c, ps5).is_err());
        // Deleting an accessory leaves its system alone and returns its photo.
        let mut with_photo = accessory("Dock", Some(other));
        with_photo.photo_path = Some("covers/x.png".into());
        let dock = add(&c, with_photo).id;
        assert_eq!(
            delete_hardware(&c, dock).unwrap().as_deref(),
            Some("covers/x.png")
        );
        assert!(get_hardware(&c, other).is_ok());
        // Giving the loose accessory a new parent clears the note.
        let mut again = accessory("DualSense", Some(other));
        again.platform_id = Some(14);
        let moved = save_hardware(&c, Some(pad.id), again, &[]).unwrap();
        assert_eq!(moved.data.parent_id, Some(other));
        assert!(moved.former_parent_name.is_none());
    }

    #[test]
    fn selling_a_system_asks_what_happens_to_each_accessory() {
        let (_dir, c) = database();
        let ps5 = add(&c, system("PS5"));
        let goes = add(&c, accessory("Charging dock", Some(ps5.id))).id;
        let stays = add(&c, accessory("DualSense", Some(ps5.id))).id;
        let had_own = add(
            &c,
            HardwareInput {
                status: "Lost".into(),
                ..accessory("Headset", Some(ps5.id))
            },
        )
        .id;

        let mut sold = ps5.data.clone();
        sold.status = "Sold".into();
        sold.sale_date = Some("2026-03-01".into());
        sold.sale_price_cents = Some(35_000);
        // A stray id is refused and the whole save is rolled back.
        let other = add(&c, system("Switch")).id;
        let msg = save_hardware(&c, Some(ps5.id), sold.clone(), &[other]).unwrap_err();
        assert!(msg.contains("not an accessory"), "{msg}");
        assert_eq!(get_hardware(&c, ps5.id).unwrap().data.status, "Owned");
        assert_eq!(
            get_hardware(&c, stays).unwrap().data.parent_id,
            Some(ps5.id)
        );

        save_hardware(&c, Some(ps5.id), sold.clone(), &[goes, had_own]).unwrap();
        let goes = get_hardware(&c, goes).unwrap();
        assert_eq!(goes.data.status, "Sold");
        assert_eq!(goes.data.sale_date.as_deref(), Some("2026-03-01"));
        assert_eq!(goes.data.parent_id, Some(ps5.id));
        // The keeper becomes loose and remembers where it came from.
        let stays = get_hardware(&c, stays).unwrap();
        assert_eq!(stays.data.status, "Owned");
        assert_eq!(stays.data.parent_id, None);
        assert_eq!(stays.former_parent_name.as_deref(), Some("PS5"));
        // An accessory that already had its own outcome keeps it.
        assert_eq!(get_hardware(&c, had_own).unwrap().data.status, "Lost");

        // Saving the already-sold system again changes nothing for the accessories.
        let mut renamed = sold;
        renamed.name = "PS5 Digital".into();
        save_hardware(&c, Some(ps5.id), renamed, &[]).unwrap();
        assert_eq!(
            get_hardware(&c, goes.id).unwrap().data.parent_id,
            Some(ps5.id)
        );
        // Moving a system between non-owned statuses or back to Owned does not loosen anyone either.
        let mut back = get_hardware(&c, ps5.id).unwrap().data;
        back.status = "Owned".into();
        save_hardware(&c, Some(ps5.id), back, &[]).unwrap();
        assert_eq!(
            get_hardware(&c, goes.id).unwrap().data.parent_id,
            Some(ps5.id)
        );
    }

    #[test]
    fn platforms_in_use_by_hardware_cannot_be_deleted() {
        let (_dir, c) = database();
        catalog::save_platform(&c, None, "Custom A", "CA", None).unwrap();
        catalog::save_platform(&c, None, "Custom B", "CB", None).unwrap();
        let platforms = catalog::list_platforms(&c).unwrap();
        let a = platforms.iter().find(|p| p.name == "Custom A").unwrap().id;
        let b = platforms.iter().find(|p| p.name == "Custom B").unwrap().id;
        let mut item = system("Weird console");
        item.platform_id = Some(a);
        add(&c, item);
        assert!(catalog::delete_platform(&c, a).is_err());
        // Used only as an extra compatible platform: deletable, and the link goes with it.
        let mut pad = accessory("Pad", None);
        pad.compat_platform_ids = vec![b];
        let pad = add(&c, pad).id;
        catalog::delete_platform(&c, b).unwrap();
        assert!(
            get_hardware(&c, pad)
                .unwrap()
                .data
                .compat_platform_ids
                .is_empty()
        );
    }

    #[test]
    fn a_photo_is_kept_while_hardware_uses_it() {
        let (dir, c) = database();
        let mut bytes = Vec::new();
        image::RgbaImage::from_pixel(2, 2, image::Rgba([9, 9, 9, 255]))
            .write_to(
                &mut std::io::Cursor::new(&mut bytes),
                image::ImageFormat::Png,
            )
            .unwrap();
        let photo = assets::import_bytes(dir.path(), &bytes, "covers").unwrap();
        let mut input = system("PS5");
        input.photo_path = Some(photo.clone());
        let item = add(&c, input);
        assets::remove_unused(&c, dir.path(), &photo).unwrap();
        assert!(assets::resolve(dir.path(), &photo).unwrap().exists());
        delete_hardware(&c, item.id).unwrap();
        assets::remove_unused(&c, dir.path(), &photo).unwrap();
        assert!(!assets::resolve(dir.path(), &photo).unwrap().exists());
    }

    #[test]
    fn the_listing_is_ordered_by_name_ignoring_case() {
        let (_dir, c) = database();
        for name in ["switch", "Atari 2600", "PS5", "Dreamcast"] {
            add(&c, system(name));
        }
        let names: Vec<_> = list_hardware(&c)
            .unwrap()
            .into_iter()
            .map(|h| h.data.name)
            .collect();
        assert_eq!(names, ["Atari 2600", "Dreamcast", "PS5", "switch"]);
    }
}
