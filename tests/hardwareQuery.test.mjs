import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyHardwareFilters,
  hardwareRows,
  visibleHardware,
  formatPrice,
  parsePrice,
} from "../src/hardwareQuery.ts";

const platforms = [
  { id: 14, name: "PlayStation 5", short_name: "PS5" },
  { id: 7, name: "Nintendo Switch", short_name: "NS" },
  { id: 19, name: "PC", short_name: "PC" },
];
let nextId = 1;
const item = (kind, name, extra = {}) => ({
  id: nextId++,
  kind,
  name,
  platform_id: 14,
  parent_id: null,
  manufacturer: null,
  model: null,
  region: null,
  serial: null,
  color: null,
  condition: null,
  status: "Owned",
  former_parent_name: null,
  ...extra,
});
const ps5 = item("system", "PlayStation 5", { manufacturer: "Sony" });
const pad = item("accessory", "DualSense", { parent_id: ps5.id, color: "White" });
const dock = item("accessory", "Charging Dock", { parent_id: ps5.id });
const sw = item("system", "Switch", { platform_id: 7, status: "Sold" });
const joy = item("accessory", "Joy-Con", { parent_id: sw.id, platform_id: 7 });
const loosePad = item("accessory", "8BitDo Pad", {
  platform_id: 19,
  former_parent_name: "Old PC",
});
const items = [loosePad, joy, sw, dock, pad, ps5];
const none = new Set();
const names = (rows) =>
  rows.map((r) => (r.type === "group" ? `[${r.label} ${r.count}]` : `${"  ".repeat(r.depth)}${r.item.name}`));
const run = (filters = {}, grouping = "grouped", collapsed = none) =>
  hardwareRows(items, platforms, { ...emptyHardwareFilters(), ...filters }, grouping, collapsed);

test("grouped: systems by name, each followed by its accessories, then loose accessories", () => {
  assert.deepEqual(names(run()), [
    "PlayStation 5",
    "  Charging Dock",
    "  DualSense",
    "Switch",
    "  Joy-Con",
    "[Loose accessories 1]",
    "8BitDo Pad",
  ]);
});

test("a collapsed system hides its accessories but still reports how many it has", () => {
  const rows = run({}, "grouped", new Set([ps5.id]));
  assert.deepEqual(names(rows).slice(0, 3), ["PlayStation 5", "Switch", "  Joy-Con"]);
  const row = rows[0];
  assert.equal(row.children, 2);
  assert.equal(row.expanded, false);
  assert.equal(rows[1].expanded, true);
});

test("flat: every item by name, each knowing its parent", () => {
  const rows = run({}, "flat");
  assert.deepEqual(names(rows), [
    "8BitDo Pad",
    "Charging Dock",
    "DualSense",
    "Joy-Con",
    "PlayStation 5",
    "Switch",
  ]);
  const parents = Object.fromEntries(rows.map((r) => [r.item.name, r.parentName]));
  assert.equal(parents["DualSense"], "PlayStation 5");
  assert.equal(parents["8BitDo Pad"], null);
  assert.equal(parents["Switch"], null);
});

test("a search that matches only an accessory keeps its system, dimmed, for context", () => {
  const rows = run({ search: "dualsense" });
  assert.deepEqual(names(rows), ["PlayStation 5", "  DualSense"]);
  assert.equal(rows[0].dimmed, true);
  assert.equal(rows[1].dimmed, false);
});

test("an active search opens collapsed groups and hides non-matching siblings", () => {
  const rows = run({ search: "white" }, "grouped", new Set([ps5.id]));
  assert.deepEqual(names(rows), ["PlayStation 5", "  DualSense"]);
});

test("search covers platform, manufacturer, parent name and the former parent, word by word", () => {
  assert.deepEqual(names(run({ search: "sony" })), ["PlayStation 5"]);
  // By platform name: the PS5 and its accessories share that platform.
  assert.deepEqual(names(run({ search: "playstation" })), [
    "PlayStation 5",
    "  Charging Dock",
    "  DualSense",
  ]);
  // The parent's name matches its accessories.
  assert.deepEqual(names(run({ search: "joy switch" })), ["Switch", "  Joy-Con"]);
  assert.deepEqual(names(run({ search: "old pc" })), ["[Loose accessories 1]", "8BitDo Pad"]);
  assert.deepEqual(names(run({ search: "  SONY  " })), ["PlayStation 5"]);
  assert.deepEqual(names(run({ search: "zzz" })), []);
});

test("kind and status filters apply to every row", () => {
  assert.deepEqual(names(run({ kind: "system" })), ["PlayStation 5", "Switch"]);
  assert.deepEqual(names(run({ status: "Sold" })), ["Switch"]);
  assert.deepEqual(names(run({ kind: "accessory" }, "flat")).length, 4);
  // An accessory filter keeps each system as dimmed context in the grouped view.
  const rows = run({ kind: "accessory" });
  assert.deepEqual(names(rows), [
    "PlayStation 5",
    "  Charging Dock",
    "  DualSense",
    "Switch",
    "  Joy-Con",
    "[Loose accessories 1]",
    "8BitDo Pad",
  ]);
  assert.deepEqual(rows.filter((r) => r.type === "item" && r.dimmed).length, 2);
});

test("an accessory whose parent no longer exists is listed as loose", () => {
  const orphan = item("accessory", "Orphan", { parent_id: 9999 });
  const rows = hardwareRows([orphan], platforms, emptyHardwareFilters(), "grouped", none);
  assert.deepEqual(names(rows), ["[Loose accessories 1]", "Orphan"]);
});

test("the selection stays when still listed, else falls to the first item or nothing", () => {
  const rows = run();
  assert.equal(visibleHardware(rows, joy.id), joy.id);
  assert.equal(visibleHardware(rows, 4242), ps5.id);
  assert.equal(visibleHardware(rows, null), ps5.id);
  assert.equal(visibleHardware(run({ search: "zzz" }), joy.id), null);
});

test("prices format to dollars and parse back to cents, rejecting nonsense", () => {
  assert.equal(formatPrice(null), "-");
  assert.equal(formatPrice(0), "$0.00");
  assert.equal(formatPrice(123456), "$1,234.56");
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice("  "), null);
  assert.equal(parsePrice("12"), 1200);
  assert.equal(parsePrice("$1,234.5"), 123450);
  assert.equal(parsePrice("0.07"), 7);
  for (const bad of ["abc", "-5", "1.234", "1e3", "12.", "10000001"])
    assert.equal(parsePrice(bad), undefined, bad);
});
