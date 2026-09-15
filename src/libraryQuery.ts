import type { Game, Platform } from "./types";

export const sortOptions = [
  ["title_asc", "Title A-Z"],
  ["title_desc", "Title Z-A"],
  ["release_desc", "Release Date Newest"],
  ["release_asc", "Release Date Oldest"],
  ["rating_desc", "Rating High to Low"],
  ["rating_asc", "Rating Low to High"],
  ["added_desc", "Date Added Newest"],
  ["added_asc", "Date Added Oldest"],
  ["platform_asc", "Platform A-Z"],
] as const;
export type LibraryFilters = {
  search: string;
  platform: string;
  account: string;
  status: string;
  genre: string;
  tag: string;
  media: string;
};
export const emptyFilters = (): LibraryFilters => ({
  search: "",
  platform: "",
  account: "",
  status: "",
  genre: "",
  tag: "",
  media: "",
});
export const normalize = (value: string | null | undefined) =>
  (value ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
export const filterCount = (filters: LibraryFilters) =>
  Object.entries(filters).filter(
    ([key, value]) => key !== "search" && value !== "",
  ).length;
export const hasFilters = (filters: LibraryFilters) =>
  Boolean(normalize(filters.search) || filterCount(filters));

export function distinctValues(values: Array<string | null>) {
  const distinct = new Map<string, string>();
  for (const value of values) {
    const key = normalize(value);
    if (key && !distinct.has(key))
      distinct.set(key, value!.trim().replace(/\s+/g, " "));
  }
  return [...distinct].sort(([a], [b]) => a.localeCompare(b));
}

export function visibleSelection(
  games: readonly Game[],
  selected: number | null,
) {
  return games.some((g) => g.id === selected)
    ? selected
    : (games[0]?.id ?? null);
}

export function queryLibrary(
  games: readonly Game[],
  platforms: readonly Platform[],
  filters: LibraryFilters,
  sort: string,
) {
  const names = new Map(platforms.map((p) => [p.id, p.name]));
  const words = normalize(filters.search).split(" ").filter(Boolean);
  const visible = games.filter((g) => {
    const account = normalize(g.account);
    if (filters.platform && String(g.platform_id) !== filters.platform)
      return false;
    // Prefix named accounts so a literal account called "No Account" remains distinct.
    if (
      filters.account &&
      (filters.account === "none"
        ? Boolean(account)
        : `value:${account}` !== filters.account)
    )
      return false;
    if (filters.status && g.play_status !== filters.status) return false;
    if (filters.genre && normalize(g.genre) !== filters.genre) return false;
    if (filters.media && g.media_type !== filters.media) return false;
    if (filters.tag && !g.tags.some((t) => normalize(t) === filters.tag))
      return false;
    const text = normalize(
      [
        g.title,
        names.get(g.platform_id),
        g.account,
        g.genre,
        g.developer,
        g.publisher,
        ...g.tags,
      ].join(" "),
    );
    return words.every((word) => text.includes(word));
  });
  const title = (a: Game, b: Game) =>
    normalize(a.title).localeCompare(normalize(b.title)) || a.id - b.id;
  function optional(
    a: string | number | null,
    b: string | number | null,
    descending: boolean,
  ) {
    if (a === null || a === "") return b === null || b === "" ? 0 : 1;
    if (b === null || b === "") return -1;
    const result = a < b ? -1 : a > b ? 1 : 0;
    return descending ? -result : result;
  }
  return visible.sort((a, b) => {
    let result = 0;
    switch (sort) {
      case "title_desc":
        return (
          normalize(b.title).localeCompare(normalize(a.title)) || a.id - b.id
        );
      case "release_desc":
      case "release_asc":
        result = optional(
          a.release_date,
          b.release_date,
          sort === "release_desc",
        );
        break;
      case "rating_desc":
      case "rating_asc":
        result = optional(a.rating, b.rating, sort === "rating_desc");
        break;
      case "added_desc":
      case "added_asc":
        result = optional(a.date_added, b.date_added, sort === "added_desc");
        break;
      case "platform_asc":
        result = normalize(names.get(a.platform_id)).localeCompare(
          normalize(names.get(b.platform_id)),
        );
        break;
    }
    return result || title(a, b);
  });
}
