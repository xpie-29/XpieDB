import test from "node:test";
import assert from "node:assert/strict";
import {
  queryLibrary,
  emptyFilters,
  visibleSelection,
  distinctValues,
  hasFilters,
  filterCount,
  sortOptions,
} from "../src/libraryQuery.ts";

const platforms = [
  { id: 1, name: "Nintendo Switch" },
  { id: 2, name: "PC" },
  { id: 3, name: "Custom Platform" },
];
const game = (id, title, extra = {}) => ({
  id,
  title,
  platform_id: 1,
  account: null,
  genre: null,
  developer: null,
  publisher: null,
  tags: [],
  rating: null,
  release_date: null,
  date_added: "2020-01-01T00:00:00Z",
  media_type: "Physical",
  play_status: "Not Started",
  notes_html: "<p>Secret notes</p>",
  ...extra,
});
const games = [
  game(1, "Super Mario", {
    account: "Steam Main",
    genre: "Adventure",
    developer: "North Studio",
    publisher: "Acme",
    tags: ["Favorite"],
    rating: 5,
    release_date: "2022-01-01",
    date_added: "2022-01-01T00:00:00Z",
    play_status: "Completed",
  }),
  game(2, "Alpha", {
    platform_id: 2,
    account: " steam   MAIN ",
    genre: "adventure",
    tags: ["Indie"],
    rating: 2,
    release_date: "2020-01-01",
    media_type: "Digital",
    play_status: "Playing",
  }),
  game(3, "Zelda", {
    platform_id: 3,
    account: "",
    genre: " ",
    date_added: "2023-01-01T00:00:00Z",
    play_status: "Paused",
  }),
  game(4, "Beta", {
    account: "No Account",
    genre: "Puzzle",
    rating: 2,
    release_date: "2020-01-01",
    play_status: "Dropped",
  }),
];
const query = (filters = {}, sort = "title_asc", data = games) =>
  queryLibrary(data, platforms, { ...emptyFilters(), ...filters }, sort);
const ids = (values) => values.map((g) => g.id);

for (const [search, expected] of [
  ["mAr", [1]],
  ["  SUPER   mario  ", [1]],
  ["nintendo", [4, 1]],
  ["steam main", [2, 1]],
  ["north", [1]],
  ["acme", [1]],
  ["favorite", [1]],
  ["ADVENTURE", [2, 1]],
  ["custom platform", [3]],
  ["secret notes", []],
]) {
  test(`structured search: ${search}`, () =>
    assert.deepEqual(ids(query({ search })), expected));
}
for (const [filters, expected] of [
  [{ platform: "2" }, [2]],
  [{ platform: "3" }, [3]],
  [{ account: "value:steam main" }, [2, 1]],
  [{ account: "none" }, [3]],
  [{ account: "value:no account" }, [4]],
  [{ status: "Completed" }, [1]],
  [{ status: "Playing" }, [2]],
  [{ status: "Paused" }, [3]],
  [{ status: "Dropped" }, [4]],
  [{ status: "Not Started" }, []],
  [{ genre: "adventure" }, [2, 1]],
  [{ media: "Physical" }, [4, 1, 3]],
  [{ media: "Digital" }, [2]],
  [{ tag: "favorite" }, [1]],
  [
    {
      search: "mario",
      platform: "1",
      account: "value:steam main",
      status: "Completed",
      genre: "adventure",
      media: "Physical",
      tag: "favorite",
    },
    [1],
  ],
  [{ search: "mario", platform: "2" }, []],
])
  test(`AND filters ${JSON.stringify(filters)}`, () =>
    assert.deepEqual(ids(query(filters)), expected));

test("null and empty metadata options are omitted and values deduplicate", () => {
  assert.deepEqual(
    distinctValues([
      null,
      "",
      " ",
      "Steam Main",
      " steam   MAIN ",
      "Steam Alt",
    ]),
    [
      ["steam alt", "Steam Alt"],
      ["steam main", "Steam Main"],
    ],
  );
  assert.deepEqual(distinctValues(games.map((g) => g.genre)), [
    ["adventure", "Adventure"],
    ["puzzle", "Puzzle"],
  ]);
  assert.deepEqual(
    ids(
      query({ account: "none" }, "title_asc", [
        game(10, "Null"),
        game(11, "Empty", { account: " " }),
      ]),
    ),
    [11, 10],
  );
});
const orders = {
  title_asc: [2, 4, 1, 3],
  title_desc: [3, 1, 4, 2],
  release_desc: [1, 2, 4, 3],
  release_asc: [2, 4, 1, 3],
  rating_desc: [1, 2, 4, 3],
  rating_asc: [2, 4, 1, 3],
  added_desc: [3, 1, 2, 4],
  added_asc: [2, 4, 1, 3],
  platform_asc: [3, 4, 1, 2],
};
for (const [sort] of sortOptions)
  test(`sort ${sort}`, () =>
    assert.deepEqual(ids(query({}, sort)), orders[sort]));
test("query never mutates catalog and sorts only filtered results", () => {
  const before = [...games];
  assert.deepEqual(ids(query({ genre: "adventure" }, "rating_desc")), [1, 2]);
  assert.deepEqual(games, before);
  assert.deepEqual(ids(query({}, "unknown")), orders.title_asc);
});
test("selection stays visible, falls back, clears, and recovers", () => {
  assert.equal(visibleSelection(query(), 1), 1);
  assert.equal(visibleSelection(query({ platform: "2" }), 1), 2);
  assert.equal(visibleSelection([], 2), null);
  assert.equal(visibleSelection(query(), null), 2);
  assert.equal(visibleSelection(query({}, "title_desc"), 1), 1);
});
test("Clear All resets narrowing only", () => {
  const preferences = {
    library_view: "list",
    cover_size: "extra_large",
    library_sort: "rating_desc",
  };
  const state = {
    filters: {
      ...emptyFilters(),
      search: "mario",
      platform: "1",
      account: "none",
      status: "Completed",
      genre: "puzzle",
      tag: "indie",
      media: "Digital",
    },
    preferences,
  };
  assert.equal(hasFilters(state.filters), true);
  assert.equal(filterCount(state.filters), 6);
  const cleared = { ...state, filters: emptyFilters() };
  assert.equal(hasFilters(cleared.filters), false);
  assert.equal(cleared.preferences, preferences);
  assert.equal(query(cleared.filters, preferences.library_sort).length, 4);
  assert.equal(hasFilters({ ...emptyFilters(), search: "   " }), false);
});
test("selection and tie ordering are deterministic with duplicate titles", () => {
  assert.deepEqual(
    ids(query({}, "title_desc", [game(8, "Same"), game(7, "Same")])),
    [7, 8],
  );
});
