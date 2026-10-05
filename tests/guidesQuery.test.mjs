import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyGuideFilters,
  gamesWithGuides,
  guideGameName,
  guidesForGame,
  queryGuides,
  visibleGuide,
} from "../src/guidesQuery.ts";

const platforms = [
  { id: 10, name: "PlayStation", short_name: "PS" },
  { id: 6, name: "Super Nintendo", short_name: "SNES" },
];
const games = [
  { id: 1, title: "Chrono Trigger" },
  { id: 2, title: "Final Fantasy VII" },
];
let nextId = 1;
const guide = (title, extra = {}) => ({
  id: nextId++,
  title,
  game_id: null,
  game_title: null,
  platform_id: null,
  author: null,
  publisher: null,
  edition: null,
  isbn: null,
  language: null,
  ...extra,
});
const ct = guide("Chrono Trigger Official Guide", { game_id: 1, platform_id: 6, publisher: "Nintendo Power" });
const ffMap = guide("FFVII Materia Map", { game_id: 2, platform_id: 10 });
const ffGuide = guide("Final Fantasy VII Strategy", { game_id: 2, platform_id: 10, author: "BradyGames" });
const unowned = guide("Zelda Atlas", { game_title: "The Legend of Zelda", isbn: "978-0-7615-4010-7" });
const all = [unowned, ffMap, ct, ffGuide];
const titles = (list) => list.map((g) => g.title);
const run = (filters = {}) => queryGuides(all, games, platforms, { ...emptyGuideFilters(), ...filters });

test("guides are ordered by title ignoring case", () => {
  assert.deepEqual(titles(run()), [
    "Chrono Trigger Official Guide",
    "FFVII Materia Map",
    "Final Fantasy VII Strategy",
    "Zelda Atlas",
  ]);
});

test("the game name comes from the linked game, else the typed title, else nothing", () => {
  assert.equal(guideGameName(ct, games), "Chrono Trigger");
  assert.equal(guideGameName(unowned, games), "The Legend of Zelda");
  assert.equal(guideGameName(guide("Loose"), games), null);
  // A link to a game that is not in the list (should not happen) shows no name.
  assert.equal(guideGameName(guide("X", { game_id: 99 }), games), null);
});

test("search matches title, game, author, publisher, ISBN and platform, word by word", () => {
  assert.deepEqual(titles(run({ search: "brady" })), ["Final Fantasy VII Strategy"]);
  assert.deepEqual(titles(run({ search: "nintendo power" })), ["Chrono Trigger Official Guide"]);
  assert.deepEqual(titles(run({ search: "legend zelda" })), ["Zelda Atlas"]);
  assert.deepEqual(titles(run({ search: "978-0-7615" })), ["Zelda Atlas"]);
  assert.deepEqual(titles(run({ search: "playstation" })), ["FFVII Materia Map", "Final Fantasy VII Strategy"]);
  // The linked game's title matches even when the guide's own title does not mention it.
  assert.deepEqual(titles(run({ search: "final fantasy" })), ["FFVII Materia Map", "Final Fantasy VII Strategy"]);
  assert.deepEqual(titles(run({ search: "  CHRONO   guide " })), ["Chrono Trigger Official Guide"]);
  assert.deepEqual(titles(run({ search: "zzz" })), []);
});

test("the platform and link filters combine with search", () => {
  assert.deepEqual(titles(run({ platform: "10" })), ["FFVII Materia Map", "Final Fantasy VII Strategy"]);
  assert.deepEqual(titles(run({ link: "unlinked" })), ["Zelda Atlas"]);
  assert.deepEqual(titles(run({ link: "linked" })).length, 3);
  assert.deepEqual(titles(run({ platform: "10", search: "map" })), ["FFVII Materia Map"]);
  assert.deepEqual(titles(run({ platform: "6", link: "unlinked" })), []);
});

test("guides for a game, and which games have guides", () => {
  assert.deepEqual(titles(guidesForGame(all, 2)), ["FFVII Materia Map", "Final Fantasy VII Strategy"]);
  assert.deepEqual(guidesForGame(all, 99), []);
  assert.deepEqual([...gamesWithGuides(all)].sort(), [1, 2]);
  assert.equal(gamesWithGuides([unowned]).size, 0);
});

test("the selection stays when listed, else falls to the first guide", () => {
  assert.equal(visibleGuide(all, ct.id), ct.id);
  assert.equal(visibleGuide(all, 4242), unowned.id);
  assert.equal(visibleGuide([], 1), null);
});
