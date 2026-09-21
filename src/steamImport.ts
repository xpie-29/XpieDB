/** One game in the loaded Steam library. */
export type SteamItem = {
  appid: number;
  title: string;
  year: string | null;
  genre: string | null;
  playtime_minutes: number;
  matched: boolean;
  duplicate: boolean;
};
export type SteamLibrary = {
  account_name: string | null;
  matching_available: boolean;
  items: SteamItem[];
};
export type Outcome = {
  appid: number;
  title: string;
  status: "added" | "skipped" | "failed";
  message: string | null;
};

/** Games already in the library cannot be imported again, so they start unselected. */
export function defaultSelection(items: SteamItem[]) {
  return new Set(items.filter((i) => !i.duplicate).map((i) => i.appid));
}

/** Items whose title contains every whitespace-separated term, ignoring case. */
export function filterItems(items: SteamItem[], query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((i) => {
    const title = i.title.toLowerCase();
    return terms.every((t) => title.includes(t));
  });
}

export function chunk<T>(list: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < list.length; i += size)
    groups.push(list.slice(i, i + size));
  return groups;
}

/** "Never played", "45 min", or "12.5 h". */
export function playtime(minutes: number) {
  if (minutes <= 0) return "Never played";
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours >= 100 ? Math.round(hours) : Math.round(hours * 10) / 10} h`;
}

export function summarize(outcomes: Outcome[]) {
  const added = outcomes.filter((o) => o.status === "added");
  return {
    added: added.length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
    withoutCover: added.filter((o) => o.message !== null).length,
  };
}

/** Selected ids, in the order they appear in the library list. */
export function selectedInOrder(items: SteamItem[], selected: Set<number>) {
  return items
    .filter((i) => selected.has(i.appid) && !i.duplicate)
    .map((i) => i.appid);
}
