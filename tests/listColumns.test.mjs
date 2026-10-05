import test from "node:test";
import assert from "node:assert/strict";
import {
  clampWidth,
  defaultWidths,
  gridTemplate,
  parseWidths,
  serializeWidths,
} from "../src/listColumns.ts";

test("defaults apply when nothing is saved or the saved text is unusable", () => {
  for (const saved of [undefined, "", "nope", "[]", "null", "5"])
    assert.deepEqual(parseWidths(saved), defaultWidths());
});

test("saved widths are clamped per column and bad entries fall back individually", () => {
  const w = parseWidths(
    JSON.stringify({ title: 5000, genre: 1, media: "x", status: 123.6, cover: 9 }),
  );
  assert.equal(w.title, 800);
  assert.equal(w.genre, 50);
  assert.equal(w.media, defaultWidths().media);
  assert.equal(w.status, 124);
  assert.equal(w.platform, defaultWidths().platform);
  assert.equal("cover" in w, false);
});

test("widths round-trip and clampWidth rejects non-numbers", () => {
  const w = { ...defaultWidths(), title: 321 };
  assert.deepEqual(parseWidths(serializeWidths(w)), w);
  assert.equal(clampWidth("title", Number.NaN), 280);
  assert.equal(clampWidth("title", 10), 80);
});

test("the grid template lists every column then a flexible filler", () => {
  assert.equal(
    gridTemplate(defaultWidths()),
    "56px 280px 140px 80px 100px 90px 36px minmax(0, 1fr)",
  );
});
