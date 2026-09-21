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
    "Backlog",
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
  let queued = 0;
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
    backlog_position:
      statuses[i % statuses.length] === "Backlog" ? ++queued : null,
  }));
}

export async function installMock(page: Page, options: MockOptions = {}) {
  await page.addInitScript(
    ({ platforms, games, saved }) => {
      const w = window as any;
      w.preferenceWrites = [];
      w.backlogCalls = [];
      // Mirrors the Rust rules: Backlog games hold positions 1..N without gaps.
      const queue = () =>
        games
          .filter((g: any) => g.backlog_position !== null)
          .sort((a: any, b: any) => a.backlog_position - b.backlog_position);
      const renumber = () =>
        queue().forEach((g: any, i: number) => (g.backlog_position = i + 1));
      w.__TAURI_INTERNALS__ = {
        invoke: async (command: string, args: any) => {
          // Like the real backend, hand back fresh copies on every call.
          if (command === "list_games")
            return JSON.parse(JSON.stringify(games));
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
          if (command === "backlog_set_order") {
            w.backlogCalls.push([command, args.ids]);
            if (w.failNextOrder) {
              w.failNextOrder = false;
              throw "The backlog has changed. Reopen it and try again.";
            }
            const current = queue()
              .map((g: any) => g.id)
              .sort();
            const asked = [...args.ids].sort();
            if (JSON.stringify(current) !== JSON.stringify(asked))
              throw "The backlog has changed. Reopen it and try again.";
            if (w.orderDelay)
              await new Promise((r) => setTimeout(r, w.orderDelay));
            args.ids.forEach((id: number, i: number) => {
              games.find((g: any) => g.id === id).backlog_position = i + 1;
            });
            return;
          }
          if (command === "backlog_add") {
            w.backlogCalls.push([command, args.ids]);
            let added = 0;
            for (const id of args.ids) {
              const g = games.find((x: any) => x.id === id);
              if (!g) throw "This game no longer exists.";
              if (g.backlog_position !== null) continue;
              g.play_status = "Backlog";
              g.backlog_position = queue().length + 1;
              added++;
            }
            return added;
          }
          if (command === "backlog_remove") {
            w.backlogCalls.push([command, args.id, args.status]);
            const g = games.find((x: any) => x.id === args.id);
            g.play_status = args.status;
            g.backlog_position = null;
            renumber();
            return;
          }
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
