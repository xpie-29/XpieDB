import type { Game, Guide, GuideFile, Platform } from "./types.ts";

export type GuideFilters = { search: string; platform: string; link: string };
export const emptyGuideFilters = (): GuideFilters => ({
  search: "",
  platform: "",
  link: "",
});
const normalize = (value: string | null | undefined) =>
  (value ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
export const guideFiltersActive = (f: GuideFilters) =>
  Boolean(normalize(f.search) || f.platform || f.link);

/** The game a guide is for: the linked Library game's title, else the title typed in. */
export function guideGameName(guide: Guide, games: Game[]): string | null {
  if (guide.game_id !== null)
    return games.find((g) => g.id === guide.game_id)?.title ?? null;
  return guide.game_title;
}

/** Guides matching the filters, ordered by title. Every search word must appear somewhere. */
export function queryGuides(
  guides: Guide[],
  games: Game[],
  platforms: Platform[],
  filters: GuideFilters,
): Guide[] {
  const words = normalize(filters.search).split(" ").filter(Boolean);
  return guides
    .filter((g) => {
      if (filters.platform && String(g.platform_id) !== filters.platform)
        return false;
      if (filters.link === "linked" && g.game_id === null) return false;
      if (filters.link === "unlinked" && g.game_id !== null) return false;
      if (!words.length) return true;
      const platform = platforms.find((p) => p.id === g.platform_id);
      const haystack = normalize(
        [
          g.title,
          guideGameName(g, games),
          g.author,
          g.publisher,
          g.edition,
          g.isbn,
          g.language,
          platform?.name,
          platform?.short_name,
        ].join(" "),
      );
      return words.every((w) => haystack.includes(w));
    })
    .sort(
      (a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) ||
        a.id - b.id,
    );
}

/** Guides linked to one game, by title. */
export const guidesForGame = (guides: Guide[], gameId: number) =>
  guides
    .filter((g) => g.game_id === gameId)
    .sort((a, b) => a.title.localeCompare(b.title));

/** Ids of the games that have at least one linked guide. */
export const gamesWithGuides = (guides: Guide[]) =>
  new Set(guides.flatMap((g) => (g.game_id === null ? [] : [g.game_id])));

export const visibleGuide = (guides: Guide[], selected: number | null) =>
  guides.some((g) => g.id === selected) ? selected : (guides[0]?.id ?? null);

/** What the owner has of a guide: a physical copy, digital files, or both. */
export function copyLabel(guide: Guide): string {
  const digital = guide.files.length > 0;
  if (guide.has_physical && digital) return "Both";
  if (guide.has_physical) return "Physical";
  return digital ? "Digital" : "-";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
export const fileLabel = (file: GuideFile) =>
  `${file.kind === "pdf" ? "PDF" : "ePub"} · ${formatBytes(file.size_bytes)}`;
