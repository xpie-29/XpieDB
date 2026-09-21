import type { Page } from "@playwright/test";

export type MockOptions = {
  /** Replaces the generated library. */
  games?: Array<Record<string, unknown>>;
  /** Extra saved preferences, e.g. { stats_open: "false" }. */
  preferences?: Record<string, string>;
};

/** Eight platforms; the library skews heavily to the first few. */
const platforms = [
  "PC",
  "PlayStation 4",
  "Nintendo Switch",
  "Xbox 360",
  "PlayStation 2",
  "Super Nintendo",
  "Game Boy Advance",
  "Sega Genesis",
].map((name, i) => ({
  id: i + 1,
  name,
  short_name: name.slice(0, 3),
  is_builtin: true,
  icon_path: null,
  sort_order: i,
}));

/** Deterministic 60-game library used by the stats tests. */
export function sampleGames() {
  const weights = [18, 14, 10, 7, 5, 3, 2, 1];
  const platformIds = weights.flatMap((w, i) => Array(w).fill(i + 1));
  const statuses = [
    "Completed",
    "Completed",
    "Completed",
    "Completed",
    "Playing",
    "Not Started",
    "Not Started",
    "Not Started",
    "Paused",
    "Dropped",
  ];
  const genres = [
    "Action, Adventure",
    "RPG",
    "Platformer, Puzzle",
    "Strategy",
    "Action, RPG",
    "Racing",
  ];
  const developers = [
    "Nintendo",
    "Capcom",
    "Square Enix",
    "Valve",
    "Sega",
    "FromSoftware",
  ];
  return platformIds.map((platform_id, i) => ({
    id: i + 1,
    igdb_id: null,
    title: `Game ${String(i + 1).padStart(2, "0")}`,
    platform_id,
    account: null,
    release_date: i % 9 === 8 ? null : `${1992 + ((i * 7) % 33)}-06-01`,
    genre: genres[i % genres.length],
    developer: developers[(i * 5) % developers.length],
    publisher: null,
    cover_path: null,
    media_type: i % 5 < 3 ? "Physical" : "Digital",
    play_status: statuses[i % statuses.length],
    rating: i % 4 === 0 ? null : (i % 5) + 1,
    notes_html: "",
    tags: [],
    date_added: `${2021 + (i % 6)}-03-15T10:00:00Z`,
    date_modified: "2026-01-01T00:00:00Z",
  }));
}

export async function installMock(page: Page, options: MockOptions = {}) {
  await page.addInitScript(
    ({ platforms, games, saved }) => {
      const w = window as any;
      w.preferenceWrites = [];
      w.__TAURI_INTERNALS__ = {
        invoke: async (command: string, args: any) => {
          if (command === "list_games") return games;
          if (command === "list_platforms") return platforms;
          if (command === "get_preferences")
            return {
              library_view: "grid",
              cover_size: "medium",
              library_sort: "title_asc",
              ...saved,
            };
          if (command === "set_preference") {
            w.preferenceWrites.push([args.key, args.value]);
            return;
          }
          if (command === "get_app_data_info")
            return { appDataDir: "Synthetic in-memory catalog" };
          if (command === "image_data") return null;
          throw `Unexpected mocked command: ${command}`;
        },
      };
    },
    {
      platforms,
      games: options.games ?? sampleGames(),
      saved: options.preferences ?? {},
    },
  );
  await page.goto("/");
}
