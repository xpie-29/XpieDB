import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultSelection,
  filterItems,
  chunk,
  playtime,
  summarize,
  selectedInOrder,
} from "../src/steamImport.ts";

const item = (appid, title, over = {}) => ({
  appid,
  title,
  year: null,
  genre: null,
  playtime_minutes: 0,
  matched: true,
  duplicate: false,
  ...over,
});
const items = [
  item(1, "Portal 2"),
  item(2, "Half-Life", { duplicate: true }),
  item(3, "Counter-Strike 2", { matched: false }),
  item(4, "Portal"),
];

test("games already in the library start unselected", () => {
  assert.deepEqual([...defaultSelection(items)], [1, 3, 4]);
  assert.deepEqual([...defaultSelection([])], []);
});

test("filtering needs every term, ignores case, and never mutates the list", () => {
  assert.deepEqual(
    filterItems(items, "portal").map((i) => i.appid),
    [1, 4],
  );
  assert.deepEqual(
    filterItems(items, "  PORTAL   2 ").map((i) => i.appid),
    [1],
  );
  assert.deepEqual(
    filterItems(items, "strike 2").map((i) => i.appid),
    [3],
  );
  assert.deepEqual(filterItems(items, "").length, 4);
  assert.deepEqual(filterItems(items, "nothing"), []);
  assert.equal(items.length, 4);
});

test("chunk splits into groups without losing or reordering items", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([1, 2], 10), [[1, 2]]);
  assert.deepEqual(chunk([], 10), []);
  const big = Array.from({ length: 25 }, (_, i) => i);
  assert.deepEqual(
    chunk(big, 10).map((g) => g.length),
    [10, 10, 5],
  );
  assert.deepEqual(chunk(big, 10).flat(), big);
});

test("play time reads naturally", () => {
  assert.equal(playtime(0), "Never played");
  assert.equal(playtime(-5), "Never played");
  assert.equal(playtime(1), "1 min");
  assert.equal(playtime(59), "59 min");
  assert.equal(playtime(60), "1 h");
  assert.equal(playtime(90), "1.5 h");
  assert.equal(playtime(125), "2.1 h");
  assert.equal(playtime(60 * 250 + 20), "250 h");
});

test("the summary counts outcomes and games added without a cover", () => {
  const outcomes = [
    { appid: 1, title: "a", status: "added", message: null },
    {
      appid: 2,
      title: "b",
      status: "added",
      message: "Added without a cover: it could not be downloaded.",
    },
    {
      appid: 3,
      title: "c",
      status: "skipped",
      message: "Already in your library.",
    },
    { appid: 4, title: "d", status: "failed", message: "boom" },
  ];
  assert.deepEqual(summarize(outcomes), {
    added: 2,
    skipped: 1,
    failed: 1,
    withoutCover: 1,
  });
  assert.deepEqual(summarize([]), {
    added: 0,
    skipped: 0,
    failed: 0,
    withoutCover: 0,
  });
});

test("selected ids follow list order and never include duplicates", () => {
  assert.deepEqual(selectedInOrder(items, new Set([4, 1, 2, 3])), [1, 3, 4]);
  assert.deepEqual(selectedInOrder(items, new Set()), []);
  assert.deepEqual(selectedInOrder(items, new Set([99])), []);
});
