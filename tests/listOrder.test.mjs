import test from "node:test";
import assert from "node:assert/strict";
import { moved, clampIndex } from "../src/listOrder.ts";

test("moved shifts an item down, up, and to the ends without touching the input", () => {
  const list = ["a", "b", "c", "d", "e"];
  assert.deepEqual(moved(list, 1, 3), ["a", "c", "d", "b", "e"]);
  assert.deepEqual(moved(list, 3, 1), ["a", "d", "b", "c", "e"]);
  assert.deepEqual(moved(list, 4, 0), ["e", "a", "b", "c", "d"]);
  assert.deepEqual(moved(list, 0, 4), ["b", "c", "d", "e", "a"]);
  assert.deepEqual(moved(list, 2, 2), list);
  assert.deepEqual(list, ["a", "b", "c", "d", "e"]);
});

test("moved keeps every item exactly once", () => {
  const list = Array.from({ length: 30 }, (_, i) => i);
  for (const [from, to] of [
    [0, 29],
    [29, 0],
    [10, 20],
    [20, 10],
    [5, 5],
  ]) {
    const result = moved(list, from, to);
    assert.equal(result.length, 30);
    assert.deepEqual(
      [...result].sort((a, b) => a - b),
      list,
    );
    assert.equal(result[to], list[from]);
  }
});

test("clampIndex stays inside the list", () => {
  assert.equal(clampIndex(-3, 5), 0);
  assert.equal(clampIndex(2, 5), 2);
  assert.equal(clampIndex(9, 5), 4);
  assert.equal(clampIndex(0, 1), 0);
});
