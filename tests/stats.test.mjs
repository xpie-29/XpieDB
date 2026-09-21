import test from "node:test";
import assert from "node:assert/strict";
import { computeStats, foldTail, formatPct, statusOrder } from "../src/stats.ts";

const platforms = [
  { id: 1, name: "PC" },
  { id: 2, name: "PlayStation 4" },
  { id: 3, name: "Switch" },
];
let nextId = 1;
const game = (over = {}) => ({
  id: nextId++,
  title: `Game ${nextId}`,
  platform_id: 1,
  genre: null,
  developer: null,
  release_date: null,
  media_type: "Physical",
  play_status: "Not Started",
  rating: null,
  date_added: "2026-03-01T00:00:00Z",
  ...over,
});
const by = (shares) => Object.fromEntries(shares.map((s) => [s.label, s.count]));

test("an empty scope yields zeros, not NaN", () => {
  const s = computeStats([], platforms);
  assert.equal(s.total, 0);
  assert.equal(s.completedPct, 0);
  assert.equal(s.averageRating, null);
  assert.deepEqual(s.byPlatform, []);
  assert.ok(s.byStatus.every((x) => x.count === 0 && x.pct === 0));
  assert.ok(!JSON.stringify(s).includes("null,NaN") && !JSON.stringify(s).includes("NaN"));
});

test("platform shares are counted, sorted largest first, and sum to 100%", () => {
  const games = [
    ...Array.from({ length: 5 }, () => game({ platform_id: 2 })),
    ...Array.from({ length: 3 }, () => game({ platform_id: 1 })),
    game({ platform_id: 3 }),
    game({ platform_id: 99 }),
  ];
  const s = computeStats(games, platforms);
  assert.equal(s.total, 10);
  assert.equal(s.platformCount, 4);
  assert.deepEqual(
    s.byPlatform.map((p) => [p.label, p.count, p.pct]),
    [
      ["PlayStation 4", 5, 50],
      ["PC", 3, 30],
      ["Switch", 1, 10],
      ["Unknown platform", 1, 10],
    ],
  );
  assert.equal(s.byPlatform.reduce((a, p) => a + p.pct, 0), 100);
});

test("ties sort by label so the order never jumps", () => {
  const games = [game({ platform_id: 3 }), game({ platform_id: 1 }), game({ platform_id: 2 })];
  assert.deepEqual(computeStats(games, platforms).byPlatform.map((p) => p.label), ["PC", "PlayStation 4", "Switch"]);
});

test("status breakdown keeps a fixed order and includes zero counts", () => {
  const games = [
    game({ play_status: "Completed" }),
    game({ play_status: "Completed" }),
    game({ play_status: "Playing" }),
    game({ play_status: "Not Started" }),
  ];
  const s = computeStats(games, platforms);
  assert.deepEqual(s.byStatus.map((x) => x.label), [...statusOrder]);
  assert.deepEqual(s.byStatus.map((x) => x.count), [2, 1, 1, 0, 0]);
  assert.equal(s.completedPct, 50);
  assert.equal(s.backlog, 1);
  assert.equal(s.backlogPct, 25);
});

test("unexpected statuses are counted as Other instead of vanishing", () => {
  const s = computeStats([game({ play_status: "Completed" }), game({ play_status: "Wishlist" })], platforms);
  assert.equal(s.byStatus.at(-1).label, "Other");
  assert.equal(s.byStatus.at(-1).count, 1);
  assert.equal(s.byStatus.reduce((a, x) => a + x.count, 0), 2);
});

test("ratings: average over rated games only, distribution includes Unrated", () => {
  const games = [
    game({ rating: 5 }),
    game({ rating: 4 }),
    game({ rating: 4 }),
    game(),
    game({ rating: 0 }), // out of range: treated as unrated
  ];
  const s = computeStats(games, platforms);
  assert.equal(s.rated, 3);
  assert.ok(Math.abs(s.averageRating - 13 / 3) < 1e-9);
  assert.deepEqual(by(s.ratings), { "1★": 0, "2★": 0, "3★": 0, "4★": 2, "5★": 1, Unrated: 2 });
});

test("physical and digital are counted separately", () => {
  const s = computeStats([game(), game(), game({ media_type: "Digital" })], platforms);
  assert.equal(s.physical, 2);
  assert.equal(s.digital, 1);
});

test("release decades are ordered, with unknown dates last", () => {
  const games = [
    game({ release_date: "1998-05-01" }),
    game({ release_date: "1991" }),
    game({ release_date: "2004-01-01" }),
    game({ release_date: "20" }),
    game(),
  ];
  const s = computeStats(games, platforms);
  assert.deepEqual(s.decades.map((d) => [d.label, d.count]), [["1990s", 2], ["2000s", 1], ["Unknown", 2]]);
});

test("added-per-year keeps the latest ten years in order", () => {
  const games = Array.from({ length: 13 }, (_, i) => game({ date_added: `${2010 + i}-06-01T00:00:00Z` }));
  const s = computeStats(games, platforms);
  assert.deepEqual(s.addedYears.map((y) => y.label), Array.from({ length: 10 }, (_, i) => String(2013 + i)));
});

test("genres and developers split lists, ignore case and duplicates, count games once each", () => {
  const games = [
    game({ genre: "Action, Adventure", developer: "Nintendo" }),
    game({ genre: "action ,  RPG,Action", developer: "nintendo, Retro Studios" }),
    game({ genre: "  ", developer: "" }),
    game(),
  ];
  const s = computeStats(games, platforms);
  assert.deepEqual(by(s.genres), { Action: 2, Adventure: 1, RPG: 1 });
  assert.equal(s.genres[0].pct, 50);
  assert.deepEqual(by(s.developers), { Nintendo: 2, "Retro Studios": 1 });
});

test("foldTail keeps the top slices and folds the rest into Other", () => {
  const make = (n) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, label: `L${i}`, count: 10 - i, pct: 10 - i }));
  assert.equal(foldTail(make(7), 6, "platforms").length, 7); // folding one slice is pointless
  const folded = foldTail(make(10), 6, "platforms");
  assert.equal(folded.length, 7);
  assert.equal(folded.at(-1).label, "Other (4 platforms)");
  assert.equal(folded.at(-1).count, 4 + 3 + 2 + 1);
  assert.equal(folded.reduce((a, s) => a + s.count, 0), make(10).reduce((a, s) => a + s.count, 0));
});

test("percent formatting stays honest for tiny and rounded shares", () => {
  assert.equal(formatPct(0), "0%");
  assert.equal(formatPct(0.2), "<1%");
  assert.equal(formatPct(4.5), "4.5%");
  assert.equal(formatPct(4.96), "5%");
  assert.equal(formatPct(9.96), "10%");
  assert.equal(formatPct(33.4), "33%");
  assert.equal(formatPct(100), "100%");
});
