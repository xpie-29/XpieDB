/** Columns of the Library list view: their default and minimum widths, and how widths are stored. */
export const listColumns = [
  { key: "platform", label: "Platform", width: 56, min: 40 },
  { key: "title", label: "Title", width: 200, min: 80 },
  { key: "genre", label: "Genre", width: 120, min: 50 },
  { key: "media", label: "Media", width: 70, min: 50 },
  { key: "status", label: "Status", width: 90, min: 60 },
  { key: "rating", label: "Rating", width: 80, min: 60 },
  { key: "notes", label: "Notes", width: 36, min: 28 },
  { key: "guides", label: "Guides", width: 36, min: 28 },
] as const;

export type ColumnKey = (typeof listColumns)[number]["key"];
export type ColumnWidths = Record<ColumnKey, number>;

export const maxColumnWidth = 800;

export const defaultWidths = (): ColumnWidths =>
  Object.fromEntries(listColumns.map((c) => [c.key, c.width])) as ColumnWidths;

export function clampWidth(key: ColumnKey, width: number) {
  const column = listColumns.find((c) => c.key === key)!;
  if (!Number.isFinite(width)) return column.width;
  return Math.min(maxColumnWidth, Math.max(column.min, Math.round(width)));
}

/** Reads the saved JSON; anything missing or invalid falls back to that column's default. */
export function parseWidths(saved: string | undefined): ColumnWidths {
  const widths = defaultWidths();
  let data: unknown;
  try {
    data = saved ? JSON.parse(saved) : null;
  } catch {
    return widths;
  }
  if (!data || typeof data !== "object") return widths;
  for (const { key } of listColumns) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === "number") widths[key] = clampWidth(key, value);
  }
  return widths;
}

export const serializeWidths = (widths: ColumnWidths) =>
  JSON.stringify(widths);

/** CSS grid template: fixed columns plus a flexible filler so rows span the pane. */
export const gridTemplate = (widths: ColumnWidths) =>
  `${listColumns.map((c) => `${widths[c.key]}px`).join(" ")} minmax(0, 1fr)`;

export const totalWidth = (widths: ColumnWidths) =>
  listColumns.reduce((sum, c) => sum + widths[c.key], 0);
