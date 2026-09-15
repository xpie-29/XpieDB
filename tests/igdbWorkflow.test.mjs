import test from "node:test";
import assert from "node:assert/strict";
import {
  duplicates,
  platformChoice,
  searchState,
} from "../src/igdbWorkflow.ts";
test("search states distinguish idle loading empty and error", () => {
  assert.equal(searchState("idle").status, "idle");
  assert.equal(searchState("loading").results.length, 0);
  assert.deepEqual(searchState("ready"), {
    status: "ready",
    results: [],
    error: "",
  });
  assert.equal(searchState("error", [], "Offline").error, "Offline");
});
test("focused search result data survives state transitions", () => {
  const result = {
    igdb_id: 42,
    title: "Synthetic",
    release_year: "2020",
    thumbnail: null,
    platforms: [],
    version: false,
  };
  assert.deepEqual(searchState("ready", [result]).results, [result]);
  assert.deepEqual(searchState("loading").results, []);
});
test("multiple platforms require explicit choice", () =>
  assert.deepEqual(
    platformChoice({
      platforms: [
        { id: 1, local_id: 1 },
        { id: 2, local_id: 2 },
      ],
    }),
    { remote: null, local: null },
  ));
test("single mapped platform can be inferred", () =>
  assert.deepEqual(platformChoice({ platforms: [{ id: 6, local_id: 19 }] }), {
    remote: 6,
    local: 19,
  }));
test("unmapped and missing platforms require local choice", () => {
  assert.deepEqual(
    platformChoice({ platforms: [{ id: 777, local_id: null }] }),
    { remote: 777, local: null },
  );
  assert.deepEqual(platformChoice({ platforms: [] }), {
    remote: null,
    local: null,
  });
});
test("duplicate IDs outrank normalized title and platform matches", () => {
  const input = { igdb_id: 42, title: " Example  Game ", platform_id: 1 };
  const games = [
    { id: 1, igdb_id: null, title: "example game", platform_id: 1 },
    { id: 2, igdb_id: 42, title: "Renamed", platform_id: 2 },
    { id: 3, igdb_id: null, title: "example game", platform_id: 2 },
  ];
  assert.deepEqual(
    duplicates(input, games).map((g) => g.id),
    [2, 1],
  );
  assert.equal(duplicates({ ...input, igdb_id: null }, games).length, 0);
  assert.equal(games.length, 3);
});
test("personal accounts and ownership do not prohibit intentional duplicate records", () => {
  const input = {
    igdb_id: 42,
    title: "Example",
    platform_id: 1,
    account: "Alt",
    media_type: "Digital",
  };
  const existing = { id: 1, ...input, account: "Main", media_type: "Physical" };
  assert.deepEqual(duplicates(input, [existing]), [existing]);
  assert.equal(input.account, "Alt");
  assert.equal(input.media_type, "Digital");
});
