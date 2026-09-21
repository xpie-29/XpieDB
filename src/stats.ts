import type { Game, Platform } from "./types";

/** One slice of a breakdown. `pct` is the share of all games in scope. */
export type Share = { key: string; label: string; count: number; pct: number };

export type Stats = {
  total: number;
  platformCount: number;
  byPlatform: Share[];
  byStatus: Share[];
  completedPct: number;
  backlog: number;
  backlogPct: number;
  notStarted: number;
  physical: number;
  digital: number;
  rated: number;
  averageRating: number | null;
  ratings: Share[]; // 1-5 stars, then Unrated
  decades: Share[];
  addedYears: Share[];
  genres: Share[];
  developers: Share[];
};

/**
 * Lifecycle statuses in a fixed order. Each status keeps its chart color
 * regardless of counts, and the order matches the validated color order.
 */
export const statusOrder = [
  "Completed",
  "Playing",
  "Not Started",
  "Paused",
  "Dropped",
  "Backlog",
] as const;

const share = (count: number, total: number) =>
  total === 0 ? 0 : (count / total) * 100;

/** "<1%" for tiny shares, one decimal under 10%, whole numbers above. */
export function formatPct(pct: number) {
  if (pct <= 0) return "0%";
  if (pct < 1) return "<1%";
  if (pct < 10) return `${pct.toFixed(1).replace(/\.0$/, "")}%`;
  return `${Math.round(pct)}%`;
}

const compact = (value: string | null | undefined) =>
  (value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");

/** Distinct comma-separated values ("Action, Adventure"), case-insensitive. */
function splitList(value: string | null | undefined) {
  const seen = new Map<string, string>();
  for (const part of compact(value).split(",")) {
    const text = compact(part);
    if (text && !seen.has(text.toLowerCase()))
      seen.set(text.toLowerCase(), text);
  }
  return [...seen.values()];
}

const byCountThenLabel = (a: Share, b: Share) =>
  b.count - a.count || a.label.localeCompare(b.label);

/** Counts labelled items into shares, largest first. */
function tally(labels: Iterable<[string, string]>, total: number): Share[] {
  const counts = new Map<string, Share>();
  for (const [key, label] of labels) {
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { key, label, count: 1, pct: 0 });
  }
  const shares = [...counts.values()];
  for (const s of shares) s.pct = share(s.count, total);
  return shares.sort(byCountThenLabel);
}

/**
 * Keeps the largest `keep` slices and folds the rest into one "Other" slice,
 * unless only one would be folded (then it is shown as itself).
 */
export function foldTail(shares: Share[], keep: number, noun: string): Share[] {
  if (shares.length <= keep + 1) return shares;
  const tail = shares.slice(keep);
  const count = tail.reduce((sum, s) => sum + s.count, 0);
  const pct = tail.reduce((sum, s) => sum + s.pct, 0);
  return [
    ...shares.slice(0, keep),
    { key: "other", label: `Other (${tail.length} ${noun})`, count, pct },
  ];
}

const yearOf = (value: string | null | undefined) => {
  const match = /^(\d{4})/.exec(value ?? "");
  return match ? Number(match[1]) : null;
};

export function computeStats(games: Game[], platforms: Platform[]): Stats {
  const total = games.length;
  const names = new Map(platforms.map((p) => [p.id, p.name]));

  const byPlatform = tally(
    games.map((g) => [
      String(g.platform_id),
      names.get(g.platform_id) ?? "Unknown platform",
    ]),
    total,
  );

  const statusCounts = new Map<string, number>();
  for (const g of games)
    statusCounts.set(g.play_status, (statusCounts.get(g.play_status) ?? 0) + 1);
  const byStatus: Share[] = statusOrder.map((status) => ({
    key: status,
    label: status,
    count: statusCounts.get(status) ?? 0,
    pct: share(statusCounts.get(status) ?? 0, total),
  }));
  const known: string[] = [...statusOrder];
  const other = [...statusCounts]
    .filter(([status]) => !known.includes(status))
    .reduce((sum, [, count]) => sum + count, 0);
  if (other > 0)
    byStatus.push({
      key: "other",
      label: "Other",
      count: other,
      pct: share(other, total),
    });
  const count = (status: string) => statusCounts.get(status) ?? 0;

  const ratedGames = games.filter(
    (g) => g.rating !== null && g.rating >= 1 && g.rating <= 5,
  );
  const ratings: Share[] = [1, 2, 3, 4, 5].map((stars) => {
    const n = ratedGames.filter((g) => g.rating === stars).length;
    return {
      key: String(stars),
      label: `${stars}★`,
      count: n,
      pct: share(n, total),
    };
  });
  ratings.push({
    key: "unrated",
    label: "Unrated",
    count: total - ratedGames.length,
    pct: share(total - ratedGames.length, total),
  });

  const decadeOf = new Map<number, number>();
  let unknownRelease = 0;
  for (const g of games) {
    const year = yearOf(g.release_date);
    if (year === null) unknownRelease++;
    else
      decadeOf.set(
        Math.floor(year / 10) * 10,
        (decadeOf.get(Math.floor(year / 10) * 10) ?? 0) + 1,
      );
  }
  const decades: Share[] = [...decadeOf]
    .sort((a, b) => a[0] - b[0])
    .map(([decade, n]) => ({
      key: String(decade),
      label: `${decade}s`,
      count: n,
      pct: share(n, total),
    }));
  if (unknownRelease > 0)
    decades.push({
      key: "unknown",
      label: "Unknown",
      count: unknownRelease,
      pct: share(unknownRelease, total),
    });

  const addedCounts = new Map<number, number>();
  for (const g of games) {
    const year = yearOf(g.date_added);
    if (year !== null) addedCounts.set(year, (addedCounts.get(year) ?? 0) + 1);
  }
  const addedYears: Share[] = [...addedCounts]
    .sort((a, b) => a[0] - b[0])
    .slice(-10)
    .map(([year, n]) => ({
      key: String(year),
      label: String(year),
      count: n,
      pct: share(n, total),
    }));

  const list = (pick: (g: Game) => string | null) =>
    tally(
      games.flatMap((g) =>
        splitList(pick(g)).map((v): [string, string] => [v.toLowerCase(), v]),
      ),
      total,
    );

  return {
    total,
    platformCount: byPlatform.length,
    byPlatform,
    byStatus,
    completedPct: share(count("Completed"), total),
    backlog: count("Backlog"),
    backlogPct: share(count("Backlog"), total),
    notStarted: count("Not Started"),
    physical: games.filter((g) => g.media_type === "Physical").length,
    digital: games.filter((g) => g.media_type === "Digital").length,
    rated: ratedGames.length,
    averageRating: ratedGames.length
      ? ratedGames.reduce((sum, g) => sum + (g.rating ?? 0), 0) /
        ratedGames.length
      : null,
    ratings,
    decades,
    addedYears,
    genres: list((g) => g.genre),
    developers: list((g) => g.developer),
  };
}
