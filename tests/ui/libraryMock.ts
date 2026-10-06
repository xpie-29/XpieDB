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
    hidden: false,
    panel: { mode: "default", image: null, fit: "fill" },
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
  // Guide 1 also has two digital copies (the ePub's copy is missing from disk).
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
    files: [] as Array<Record<string, unknown>>,
  };
  const file = (id: number, guide: number, name: string, kind: string, size: number, missing = false) => ({
    id,
    guide_id: guide,
    file_name: name,
    kind,
    size_bytes: size,
    source_url: null,
    date_added: "2026-01-02T00:00:00Z",
    missing,
    last_page: null as number | null,
    last_opened_at: null as string | null,
  });
  return [
    { ...base, id: 1, title: "Game 05 Official Guide", game_id: 5, platform_id: 1, publisher: "Prima", author: "J. Smith", purchase_price_cents: 1999, condition: "Good", files: [file(1, 1, "Game 05 Guide.pdf", "pdf", 13_002_342), file(2, 1, "Game 05 Guide.epub", "epub", 2_411_000, true)] },
    { ...base, id: 2, title: "Game 05 World Map", game_id: 5, platform_id: 1 },
    { ...base, id: 3, title: "Game 12 Strategy Guide", game_id: 12, platform_id: 2, isbn: "978-0-7615-4010-7", files: [{ ...file(4, 3, "Game 12 Guide.pdf", "pdf", 40_000), last_page: 3, last_opened_at: "2026-09-01T00:00:00Z" }] },
    { ...base, id: 4, title: "Atlas of Somewhere", game_title: "Somewhere Quest", platform_id: 6, has_physical: false },
  ];
}

export async function installMock(page: Page, options: MockOptions = {}) {
  await page.addInitScript(
    ({ platforms, games, hardware, guides, saved, steam }) => {
      const w = window as any;
      w.hardwareCalls = [];
      w.guideCalls = [];
      w.guideFileCalls = [];
      w.attachResult = "file";
      // ---- Internet Archive: mirrors the Rust client's results and rules ----
      w.archiveCalls = [];
      w.archiveMode = "ok";
      const hit = (id: string, title: string, extra: any = {}) => ({
        identifier: id, title, creator: null, year: null, has_pdf: true, has_epub: false,
        borrow_only: false, downloads: 1, score: 10, ...extra,
      });
      const archiveHits = [
        hit("doom-3-official-strategy-guide", "Doom 3 Official Strategy Guide", { creator: "BradyGames", year: "2004" }),
        hit("doom3-prima-lending", "Doom 3 Prima Guide", { borrow_only: true, has_pdf: false }),
        hit("doom-3-epub", "Doom 3 Companion", { has_pdf: false, has_epub: true, year: "2005" }),
        hit("empty-item", "Doom 3 Posters"),
      ];
      const file = (name: string, kind: string, detail: string, size: number, too = false) => ({
        name, kind, detail, size_bytes: size, too_large: too,
      });
      const archiveItems: any = {
        "doom-3-official-strategy-guide": { identifier: "doom-3-official-strategy-guide", title: "Doom 3 Official Strategy Guide", borrow_only: false, files: [
          file("doom3.pdf", "pdf", "Searchable text", 12_900_000),
          file("doom3_bw.pdf", "pdf", "Scanned pages", 90_000_000),
          file("doom3_huge.pdf", "pdf", "", 2_000_000_000, true),
        ] },
        "doom3-prima-lending": { identifier: "doom3-prima-lending", title: "Doom 3 Prima Guide", borrow_only: true, files: [] },
        "doom-3-epub": { identifier: "doom-3-epub", title: "Doom 3 Companion", borrow_only: false, files: [file("companion.epub", "epub", "", 800_000)] },
        "empty-item": { identifier: "empty-item", title: "Doom 3 Posters", borrow_only: false, files: [] },
      };
      let finishDownload: ((guide?: unknown) => void) | null = null;
      let failDownload: ((error: string) => void) | null = null;
      w.finishDownload = () => finishDownload?.();
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
          hidden: false,
          panel: { mode: "default", image: null, fit: "fill" },
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
      w.readerCalls = [];
      w.hideCalls = [];
      w.panelCalls = [];
      w.fullscreen = false;
      const bookmarks: any[] = [];
      w.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
        convertFileSrc: (path: string, protocol: string) => `http://${protocol}.localhost/${path}`,
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
              files: [],
              id: Math.max(0, ...guides.map((x: any) => x.id)) + 1,
              date_added: now,
              date_modified: now,
            };
            guides.push(created);
            return JSON.parse(JSON.stringify(created));
          }
          if (command === "plugin:window|set_fullscreen") {
            w.fullscreen = args.value;
            w.readerCalls.push(["fullscreen", args.value]);
            return;
          }
          if (command === "plugin:window|is_fullscreen") return w.fullscreen;
          if (command === "set_guide_file_position") {
            w.readerCalls.push(["position", args.id, args.page]);
            for (const g of guides) for (const f of g.files) if (f.id === args.id) { f.last_page = args.page; f.last_opened_at = "2026-10-05T00:00:00Z"; }
            return;
          }
          if (command === "list_guide_bookmarks") {
            return bookmarks.filter((b) => b.file_id === args.fileId).sort((a, b) => a.page - b.page);
          }
          if (command === "add_guide_bookmark") {
            if (bookmarks.some((b) => b.file_id === args.fileId && b.page === args.page)) throw "That page is already bookmarked.";
            const created = {
              id: Math.max(0, ...bookmarks.map((b) => b.id)) + 1,
              file_id: args.fileId,
              page: args.page,
              label: (args.label ?? "").trim() || `Page ${args.page}`,
              date_added: "2026-10-05T00:00:00Z",
            };
            bookmarks.push(created);
            w.readerCalls.push(["bookmark-add", args.fileId, args.page]);
            return created;
          }
          if (command === "rename_guide_bookmark") {
            bookmarks.find((b) => b.id === args.id).label = args.label;
            w.readerCalls.push(["bookmark-rename", args.id, args.label]);
            return;
          }
          if (command === "delete_guide_bookmark") {
            bookmarks.splice(bookmarks.findIndex((b) => b.id === args.id), 1);
            w.readerCalls.push(["bookmark-delete", args.id]);
            return;
          }
          if (command === "archive_search") {
            w.archiveCalls.push(["search", args.query]);
            if (w.archiveMode === "error") throw "Unable to reach the Internet Archive. Check your connection and try again.";
            if (w.archiveMode === "empty") return { hits: [], broadened: true };
            return { hits: archiveHits, broadened: w.archiveMode === "wide" };
          }
          if (command === "archive_item") {
            w.archiveCalls.push(["item", args.identifier]);
            return JSON.parse(JSON.stringify(archiveItems[args.identifier]));
          }
          if (command === "archive_open_page") {
            w.archiveCalls.push(["page", args.identifier]);
            return;
          }
          if (command === "archive_cancel") {
            w.archiveCalls.push(["cancel"]);
            failDownload?.("Download cancelled.");
            return;
          }
          if (command === "archive_download") {
            const r = args.request;
            w.archiveCalls.push(["download", r]);
            if (w.archiveMode === "slow") {
              await new Promise<void>((resolve, reject) => {
                finishDownload = resolve;
                failDownload = (e) => reject(e);
              });
            }
            let guide = guides.find((x: any) => x.id === r.guide_id);
            if (!guide) {
              guide = {
                ...r.new_guide,
                id: Math.max(0, ...guides.map((x: any) => x.id)) + 1,
                files: [],
                date_added: "2026-10-04T00:00:00Z",
                date_modified: "2026-10-04T00:00:00Z",
              };
              guides.push(guide);
            }
            guide.files.push({
              id: 500 + guide.files.length,
              guide_id: guide.id,
              file_name: r.file_name,
              kind: r.file_name.endsWith(".epub") ? "epub" : "pdf",
              size_bytes: 12_900_000,
              source_url: `https://archive.org/details/${r.identifier}`,
              date_added: "2026-10-04T00:00:00Z",
              missing: false,
            });
            return JSON.parse(JSON.stringify(guide));
          }
          if (command === "attach_guide_file") {
            w.guideFileCalls.push(["attach", args.guideId]);
            if (w.attachResult === "cancel") return null;
            if (w.attachResult === "error") throw "Choose a PDF or ePub file.";
            const guide = guides.find((x: any) => x.id === args.guideId);
            const created = {
              id: 100 + guide.files.length + 1,
              guide_id: guide.id,
              file_name: "Attached.pdf",
              kind: "pdf",
              size_bytes: 1_048_576,
              source_url: null,
              date_added: "2026-10-04T00:00:00Z",
              missing: false,
            };
            guide.files.push(created);
            return created;
          }
          if (command === "open_guide_file" || command === "reveal_guide_file") {
            w.readerCalls.push([command, args.id]);
            w.guideFileCalls.push([command === "open_guide_file" ? "open" : "reveal", args.id]);
            return;
          }
          if (command === "remove_guide_file") {
            w.guideFileCalls.push(["remove", args.id]);
            for (const g of guides) g.files = g.files.filter((f: any) => f.id !== args.id);
            return;
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
          // Tests that look at pictures set w.imageData to a data URL; otherwise images stay unloaded.
          if (command === "image_data") return w.imageData ?? null;
          if (command === "select_image") {
            w.panelCalls.push(["select", args.kind]);
            return w.selectedImage ?? null;
          }
          if (command === "set_game_panel") {
            w.panelCalls.push(["set", args.id, args.panel]);
            const g = games.find((x: any) => x.id === args.id);
            if (!g) throw "This game no longer exists.";
            const p = args.panel;
            if (!["default", "cover", "image"].includes(p.mode) || !["fill", "fit", "stretch", "center", "tile"].includes(p.fit))
              throw "Choose one of the listed panel backgrounds.";
            if (p.mode === "image" && !p.image) throw "Choose an image for the panel background.";
            if (p.mode === "cover" && !g.cover_path) throw "This game has no cover art to use.";
            if (w.panelFail) throw w.panelFail;
            g.panel = { mode: p.mode, image: p.image, fit: p.fit };
            return JSON.parse(JSON.stringify(g));
          }
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
              version: "0.2.0",
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
          if (command === "set_game_hidden") {
            w.hideCalls.push([args.id, args.hidden]);
            const g = games.find((x: any) => x.id === args.id);
            if (!g) throw "This game no longer exists.";
            g.hidden = args.hidden;
            return JSON.parse(JSON.stringify(g));
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
          if (command === "discard_image") {
            w.panelCalls.push(["discard", args.path]);
            return;
          }
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
