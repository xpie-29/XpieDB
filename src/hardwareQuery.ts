import type { Hardware, Platform } from "./types.ts";

export type HardwareFilters = { search: string; kind: string; status: string };
export const emptyHardwareFilters = (): HardwareFilters => ({
  search: "",
  kind: "",
  status: "",
});
const normalize = (value: string | null | undefined) =>
  (value ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
export const hardwareFiltersActive = (f: HardwareFilters) =>
  Boolean(normalize(f.search) || f.kind || f.status);

/** One line of the Hardware list. */
export type HardwareRow =
  | {
      type: "item";
      item: Hardware;
      /** 1 for an accessory shown under its system. */
      depth: 0 | 1;
      /** Accessories in this system (all of them, whatever the filters). */
      children: number;
      expanded: boolean;
      /** Shown only for context: it does not match the search or filters itself. */
      dimmed: boolean;
      /** Name of the parent system, for the Flat view. */
      parentName: string | null;
    }
  | { type: "group"; key: "loose"; label: string; count: number };

const byName = (a: Hardware, b: Hardware) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
  a.id - b.id;

export function matches(
  item: Hardware,
  filters: HardwareFilters,
  platforms: Platform[],
  parent: Hardware | undefined,
) {
  if (filters.kind && item.kind !== filters.kind) return false;
  if (filters.status && item.status !== filters.status) return false;
  const query = normalize(filters.search);
  if (!query) return true;
  const platform = platforms.find((p) => p.id === item.platform_id);
  const haystack = normalize(
    [
      item.name,
      item.manufacturer,
      item.model,
      item.region,
      item.serial,
      item.color,
      item.condition,
      platform?.name,
      platform?.short_name,
      parent?.name,
      item.former_parent_name,
    ].join(" "),
  );
  return query.split(" ").every((word) => haystack.includes(word));
}

/**
 * The rows of the Hardware list.
 *
 * Grouped: each system followed by its accessories, then the loose accessories (no parent) under a
 * heading. While a search or filter is active every group is open, and a system that only has
 * matching accessories is kept (dimmed) so the match has context.
 * Flat: every matching item in name order, with its parent's name available.
 */
export function hardwareRows(
  items: Hardware[],
  platforms: Platform[],
  filters: HardwareFilters,
  grouping: "grouped" | "flat",
  collapsed: ReadonlySet<number>,
): HardwareRow[] {
  const byId = new Map(items.map((h) => [h.id, h]));
  const parentOf = (h: Hardware) =>
    h.parent_id === null ? undefined : byId.get(h.parent_id);
  const hit = new Map(
    items.map((h) => [h.id, matches(h, filters, platforms, parentOf(h))]),
  );
  const parentName = (h: Hardware) => parentOf(h)?.name ?? null;
  if (grouping === "flat") {
    return items
      .filter((h) => hit.get(h.id))
      .sort(byName)
      .map((item) => ({
        type: "item",
        item,
        depth: 0,
        children: 0,
        expanded: false,
        dimmed: false,
        parentName: parentName(item),
      }));
  }
  const active = hardwareFiltersActive(filters);
  const childrenOf = new Map<number, Hardware[]>();
  for (const h of items)
    if (h.parent_id !== null && byId.has(h.parent_id))
      childrenOf.set(h.parent_id, [...(childrenOf.get(h.parent_id) ?? []), h]);
  const rows: HardwareRow[] = [];
  const systems = items.filter((h) => h.kind === "system");
  for (const system of systems.sort(byName)) {
    const kids = (childrenOf.get(system.id) ?? []).sort(byName);
    const shownKids = kids.filter((k) => hit.get(k.id));
    const selfHit = hit.get(system.id) === true;
    if (!selfHit && !shownKids.length) continue;
    const expanded = active ? true : !collapsed.has(system.id);
    rows.push({
      type: "item",
      item: system,
      depth: 0,
      children: kids.length,
      expanded,
      dimmed: !selfHit,
      parentName: null,
    });
    if (expanded)
      for (const kid of shownKids)
        rows.push({
          type: "item",
          item: kid,
          depth: 1,
          children: 0,
          expanded: false,
          dimmed: false,
          parentName: system.name,
        });
  }
  const loose = items
    .filter(
      (h) =>
        h.kind === "accessory" &&
        (h.parent_id === null || !byId.has(h.parent_id)) &&
        hit.get(h.id),
    )
    .sort(byName);
  if (loose.length) {
    rows.push({
      type: "group",
      key: "loose",
      label: "Loose accessories",
      count: loose.length,
    });
    for (const item of loose)
      rows.push({
        type: "item",
        item,
        depth: 0,
        children: 0,
        expanded: false,
        dimmed: false,
        parentName: null,
      });
  }
  return rows;
}

/** The selection to use after filtering: the current one if still listed, else the first item. */
export function visibleHardware(rows: HardwareRow[], selected: number | null) {
  const ids = rows.flatMap((r) => (r.type === "item" ? [r.item.id] : []));
  return selected !== null && ids.includes(selected) ? selected : (ids[0] ?? null);
}

export function formatPrice(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "-";
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
/** Parses "1,234.50" or "12" to cents; empty is null and anything else is invalid (undefined). */
export function parsePrice(text: string): number | null | undefined {
  const value = text.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!value) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return undefined;
  const cents = Math.round(Number(value) * 100);
  return cents <= 1_000_000_000 ? cents : undefined;
}
