import type { Game, GameInput } from "./types";
export type IgdbPlatform = {
  id: number;
  name: string;
  local_id: number | null;
};
export type IgdbResult = {
  igdb_id: number;
  title: string;
  release_year: string | null;
  thumbnail: string | null;
  platforms: IgdbPlatform[];
  version: boolean;
};
export type IgdbImport = { input: GameInput; warning: string | null };
export type SearchState = {
  status: "idle" | "loading" | "ready" | "error";
  results: IgdbResult[];
  error: string;
};
export function searchState(
  status: SearchState["status"],
  results: IgdbResult[] = [],
  error = "",
): SearchState {
  return { status, results, error };
}
export function platformChoice(result: IgdbResult) {
  const platform =
    result.platforms.length === 1 ? result.platforms[0] : undefined;
  return { remote: platform?.id ?? null, local: platform?.local_id ?? null };
}
export function duplicates(input: GameInput, games: Game[]) {
  if (!input.igdb_id) return [];
  const normalize = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
  return games
    .filter(
      (g) =>
        g.igdb_id === input.igdb_id ||
        (g.platform_id === input.platform_id &&
          normalize(g.title) === normalize(input.title)),
    )
    .sort(
      (a, b) =>
        Number(b.igdb_id === input.igdb_id) -
          Number(a.igdb_id === input.igdb_id) || a.id - b.id,
    );
}
