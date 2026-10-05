import type { Page } from "@playwright/test";

export type SteamItem = {
  appid: number;
  title: string;
  year: string | null;
  genre: string | null;
  playtime_minutes: number;
  matched: boolean;
  duplicate: boolean;
};

/**
 * A deterministic Steam library: 27 games, 2 already in the library (#2, #13),
 * every fifth without an IGDB match, every third never played.
 */
export function sampleSteamLibrary(count = 27) {
  const items: SteamItem[] = Array.from({ length: count }, (_, k) => {
    const i = k + 1;
    return {
      appid: 1000 + i,
      title: `Steam Game ${String(i).padStart(2, "0")}`,
      year: i % 5 === 0 ? null : String(2010 + (i % 12)),
      genre: i % 5 === 0 ? null : "Action, Indie",
      playtime_minutes: i % 3 === 0 ? 0 : i * 17,
      matched: i % 5 !== 0,
      duplicate: i === 2 || i === 13,
    };
  });
  return {
    account_name: "Test Player",
    matching_available: true,
    items,
  };
}

export type MockOptions = {
  /** Steam import behavior. */
  steam?: {
    configured?: boolean;
    library?: ReturnType<typeof sampleSteamLibrary>;
  };
  /** Guides (see `sampleGuides`); empty by default. */
  guides?: Array<Record<string, unknown>>;
  /** Hardware items (see `sampleHardware`); empty by default. */
  hardware?: Array<Record<string, unknown>>;
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
  "Atari 2600",
  "Atari 7800",
].map((name, i) => ({
  id: i + 1,
  name,
  short_name: name.slice(0, 3),
  is_builtin: true,
  icon_path: null,
  sort_order: i,
}));

/** Deterministic 60-game library used by the stats tests. */
platforms.push({
  id: 18,
  name: "Steam",
  short_name: "Steam",
  is_builtin: true,
  icon_path: null,
  sort_order: 18,
});

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

/** A small Hardware collection: three families (one sold) plus a loose accessory. */
export function sampleHardware() {
  const base = {
    parent_id: null,
    manufacturer: null,
    model: null,
    region: null,
    serial: null,
    color: null,
    condition: null,
    completeness: null,
    status: "Owned",
    is_working: true,
    is_modded: false,
    purchase_date: null,
    purchase_price_cents: null,
    purchase_source: null,
    sale_date: null,
    sale_price_cents: null,
    photo_path: null,
    notes_html: "",
    compat_platform_ids: [] as number[],
    former_parent_name: null,
    date_added: "2026-01-01T00:00:00Z",
    date_modified: "2026-01-01T00:00:00Z",
  };
  return [
    { ...base, id: 1, kind: "system", name: "PlayStation 4 Pro", platform_id: 2, manufacturer: "Sony", condition: "Good", purchase_price_cents: 29999 },
    { ...base, id: 2, kind: "accessory", name: "DualShock 4", platform_id: 2, parent_id: 1, color: "Black", purchase_price_cents: 5999 },
    { ...base, id: 3, kind: "accessory", name: "PlayStation Camera", platform_id: 2, parent_id: 1 },
    { ...base, id: 4, kind: "system", name: "Nintendo Switch", platform_id: 3, manufacturer: "Nintendo" },
    { ...base, id: 5, kind: "accessory", name: "Joy-Con (pair)", platform_id: 3, parent_id: 4 },
    { ...base, id: 6, kind: "accessory", name: "Pro Controller", platform_id: 3, parent_id: 4, compat_platform_ids: [1] },
    { ...base, id: 7, kind: "accessory", name: "8BitDo SN30", platform_id: 6, compat_platform_ids: [1, 3] },
    { ...base, id: 8, kind: "system", name: "Super Nintendo", platform_id: 6, status: "Sold", sale_date: "2025-06-01", sale_price_cents: 12000 },
    { ...base, id: 9, kind: "accessory", name: "SNES Controller", platform_id: 6, parent_id: 8, status: "Sold" },
  ];
}

/**
 * A few guides: two for Game 05 (one on a different platform), one for Game 12, and one for a game that
 * is not in the Library.
 */
export function sampleGuides() {
  const base = {
    game_id: null as number | null,
    game_title: null as string | null,
    platform_id: null as number | null,
    author: null,
    publisher: null,
    edition: null,
    isbn: null,
    language: null,
    page_count: null,
    has_physical: true,
    condition: null,
    purchase_date: null,
    purchase_price_cents: null,
    purchase_source: null,
    photo_path: null,
    notes_html: "",
    date_added: "2026-01-01T00:00:00Z",
    date_modified: "2026-01-01T00:00:00Z",
  };
  return [
    { ...base, id: 1, title: "Game 05 Official Guide", game_id: 5, platform_id: 1, publisher: "Prima", author: "J. Smith", purchase_price_cents: 1999, condition: "Good" },
    { ...base, id: 2, title: "Game 05 World Map", game_id: 5, platform_id: 1 },
    { ...base, id: 3, title: "Game 12 Strategy Guide", game_id: 12, platform_id: 2, isbn: "978-0-7615-4010-7" },
    { ...base, id: 4, title: "Atlas of Somewhere", game_title: "Somewhere Quest", platform_id: 6, has_physical: false },
  ];
}

export async function installMock(page: Page, options: MockOptions = {}) {
  await page.addInitScript(
    ({ platforms, games, hardware, guides, saved, steam }) => {
      const w = window as any;
      w.hardwareCalls = [];
      w.guideCalls = [];
      w.preferenceWrites = [];
      w.backlogCalls = [];
      // ---- Steam import: mirrors the backend's add-only rules ----
      w.steamConfigured = steam.configured;
      w.steamCalls = [];
      w.steamImportCalls = [];
      w.steamFail = {};
      w.steamCoverFail = [];
      const steamAdd = (item: any, options: any) => {
        const id = Math.max(0, ...games.map((g: any) => g.id)) + 1;
        const queue = games.filter((g: any) => g.backlog_position !== null);
        const backlog = options.backlog_unplayed && item.playtime_minutes === 0;
        games.push({
          id,
          igdb_id: item.matched ? 5000 + item.appid : null,
          title: item.title,
          platform_id: 18,
          account: options.account,
          release_date: item.year ? `${item.year}-01-01` : null,
          genre: item.genre,
          developer: null,
          publisher: null,
          cover_path: null,
          media_type: "Digital",
          play_status: backlog ? "Backlog" : "Not Started",
          rating: null,
          notes_html: "",
          tags: [],
          date_added: "2026-09-21T00:00:00Z",
          date_modified: "2026-09-21T00:00:00Z",
          backlog_position: backlog ? queue.length + 1 : null,
        });
      };
      w.openedLinks = [];
      w.igdbConfigured = false;
      w.igdbCalls = [];
      // Minimal stand-in for Tauri's event plumbing, so tests can fire menu events.
      const callbacks: Record<number, (e: unknown) => void> = {};
      const listeners: Record<string, number[]> = {};
      let nextCallback = 1;
      w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      w.hasTauriListener = (event: string) =>
        (listeners[event] ?? []).length > 0;
      w.fireTauriEvent = (event: string, payload: unknown = null) =>
        (listeners[event] ?? []).forEach((id) =>
          callbacks[id]({ event, id, payload }),
        );
      // Mirrors the Rust rules: Backlog games hold positions 1..N without gaps.
      const queue = () =>
        games
          .filter((g: any) => g.backlog_position !== null)
          .sort((a: any, b: any) => a.backlog_position - b.backlog_position);
      const renumber = () =>
        queue().forEach((g: any, i: number) => (g.backlog_position = i + 1));
      w.__TAURI_INTERNALS__ = {
        transformCallback: (callback: (e: unknown) => void) => {
          callbacks[nextCallback] = callback;
          return nextCallback++;
        },
        invoke: async (command: string, args: any) => {
          // Like the real backend, hand back fresh copies on every call.
          if (command === "list_games")
            return JSON.parse(JSON.stringify(games));
          if (command === "list_platforms") return platforms;
          if (command === "list_hardware")
            return JSON.parse(JSON.stringify(hardware));
          if (command === "list_guides") return JSON.parse(JSON.stringify(guides));
          if (command === "save_guide") {
            w.guideCalls.push(["save", args.id, args.input]);
            const input = { ...args.input };
            if (!input.title.trim()) throw "Enter a title of 1 to 300 characters.";
            if (input.game_id !== null && !games.some((g: any) => g.id === input.game_id))
              throw "Choose a game from your Library.";
            if (input.game_id !== null) input.game_title = null;
            const now = "2026-10-04T00:00:00Z";
            const previous = guides.find((x: any) => x.id === args.id);
            if (previous) {
              Object.assign(previous, input, { date_modified: now });
              return JSON.parse(JSON.stringify(previous));
            }
            const created = {
              ...input,
              id: Math.max(0, ...guides.map((x: any) => x.id)) + 1,
              date_added: now,
              date_modified: now,
            };
            guides.push(created);
            return JSON.parse(JSON.stringify(created));
          }
          if (command === "delete_guide") {
            w.guideCalls.push(["delete", args.id]);
            guides.splice(guides.findIndex((x: any) => x.id === args.id), 1);
            return;
          }
          if (command === "save_hardware") {
            // Mirrors hardware.rs: parents are systems, systems have none, selling asks per accessory.
            w.hardwareCalls.push(["save", args.id, args.input, args.withAccessories]);
            const input = { ...args.input };
            if (!input.name.trim()) throw "Enter a name of 1 to 300 characters.";
            if (input.kind === "system") {
              input.parent_id = null;
              input.compat_platform_ids = [];
            } else if (
              input.parent_id !== null &&
              !hardware.some((h: any) => h.id === input.parent_id && h.kind === "system")
            )
              throw "An accessory's parent must be a system you have added.";
            if (input.status === "Owned") {
              input.sale_date = null;
              input.sale_price_cents = null;
            }
            input.compat_platform_ids = [...new Set<number>(input.compat_platform_ids)]
              .filter((p) => p !== input.platform_id)
              .sort((a, b) => a - b);
            const now = "2026-10-04T00:00:00Z";
            const previous = hardware.find((h: any) => h.id === args.id);
            if (
              previous?.kind === "system" &&
              previous.status === "Owned" &&
              input.kind === "system" &&
              input.status !== "Owned"
            ) {
              const going = args.withAccessories ?? [];
              for (const child of hardware.filter((h: any) => h.parent_id === previous.id)) {
                if (going.includes(child.id)) {
                  if (child.status === "Owned") {
                    child.status = input.status;
                    child.sale_date = input.sale_date;
                  }
                } else {
                  child.former_parent_name = input.name;
                  child.parent_id = null;
                }
              }
            }
            if (previous) {
              Object.assign(previous, input, {
                former_parent_name: input.parent_id === null ? previous.former_parent_name : null,
                date_modified: now,
              });
              return JSON.parse(JSON.stringify(previous));
            }
            const created = {
              ...input,
              id: Math.max(0, ...hardware.map((h: any) => h.id)) + 1,
              former_parent_name: null,
              date_added: now,
              date_modified: now,
            };
            hardware.push(created);
            return JSON.parse(JSON.stringify(created));
          }
          if (command === "delete_hardware") {
            w.hardwareCalls.push(["delete", args.id]);
            const gone = hardware.find((h: any) => h.id === args.id);
            for (const child of hardware.filter((h: any) => h.parent_id === args.id)) {
              child.former_parent_name = gone.name;
              child.parent_id = null;
            }
            hardware.splice(hardware.indexOf(gone), 1);
            return;
          }
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
          if (command === "igdb_config")
            return { configured: !!w.igdbConfigured };
          if (command === "igdb_save_credentials") {
            w.igdbCalls.push(["save", args]);
            w.igdbConfigured = true;
            return;
          }
          if (command === "igdb_clear_credentials") {
            w.igdbConfigured = false;
            return;
          }
          if (command === "igdb_test") return;
          if (command === "steam_config")
            return { configured: w.steamConfigured };
          if (command === "steam_clear_cache") {
            w.steamCalls.push(["clear_cache"]);
            return;
          }
          if (command === "steam_save_credentials") {
            w.steamCalls.push(["save", args]);
            if (w.steamSaveError) throw w.steamSaveError;
            w.steamConfigured = true;
            return;
          }
          if (command === "steam_clear_credentials") {
            w.steamCalls.push(["clear"]);
            w.steamConfigured = false;
            return;
          }
          if (command === "steam_test") {
            if (w.steamTestError) throw w.steamTestError;
            return {
              games: steam.library.items.length,
              account_name: steam.library.account_name,
            };
          }
          if (command === "steam_load") {
            w.steamCalls.push(["load"]);
            if (w.steamLoadError) throw w.steamLoadError;
            if (w.steamLoadDelay)
              await new Promise((r) => setTimeout(r, w.steamLoadDelay));
            return JSON.parse(JSON.stringify(steam.library));
          }
          if (command === "steam_import") {
            w.steamImportCalls.push({
              appids: args.appids,
              options: args.options,
            });
            if (w.steamThrowAtCall === w.steamImportCalls.length)
              throw "Your Steam library is no longer loaded. Load it again.";
            if (w.steamDelay)
              await new Promise((r) => setTimeout(r, w.steamDelay));
            return args.appids.map((appid: number) => {
              const item = steam.library.items.find(
                (i: any) => i.appid === appid,
              );
              const done = (status: string, message: string | null) => ({
                appid,
                title: item.title,
                status,
                message,
              });
              const have = games.some(
                (g: any) =>
                  g.platform_id === 18 &&
                  g.title.toLowerCase() === item.title.toLowerCase(),
              );
              if (item.duplicate || have)
                return done("skipped", "Already in your library.");
              if (w.steamFail[appid]) return done("failed", w.steamFail[appid]);
              steamAdd(item, args.options);
              return done(
                "added",
                w.steamCoverFail.includes(appid)
                  ? "Added without a cover: it could not be downloaded."
                  : null,
              );
            });
          }
          if (command === "plugin:event|listen") {
            (listeners[args.event] ??= []).push(args.handler);
            return args.handler;
          }
          if (command === "plugin:event|unlisten") return;
          if (command === "about_info")
            return {
              name: "XpieDB",
              version: "0.1.0",
              repository: "https://github.com/xpie-29/XpieDB",
            };
          if (command === "open_link") {
            w.openedLinks.push(args.url);
            return;
          }
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
          if (command === "save_game") {
            // Edits only (id given); the saved record replaces the old one in place.
            const index = games.findIndex((x: any) => x.id === args.id);
            games[index] = {
              ...games[index],
              ...args.input,
              date_modified: "2026-10-04T00:00:00Z",
            };
            return JSON.parse(JSON.stringify(games[index]));
          }
          if (command === "discard_image") return;
          throw `Unexpected mocked command: ${command}`;
        },
      };
    },
    {
      platforms,
      games: options.games ?? sampleGames(),
      hardware: options.hardware ?? [],
      guides: options.guides ?? [],
      saved: options.preferences ?? {},
      steam: {
        configured: options.steam?.configured ?? true,
        library: options.steam?.library ?? sampleSteamLibrary(),
      },
    },
  );
  await page.goto("/");
}
