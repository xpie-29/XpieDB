export type GameInput = {
  igdb_id: number | null;
  title: string;
  platform_id: number;
  account: string | null;
  release_date: string | null;
  genre: string | null;
  developer: string | null;
  publisher: string | null;
  cover_path: string | null;
  media_type: string;
  play_status: string;
  rating: number | null;
  notes_html: string;
  tags: string[];
};
export type Game = GameInput & {
  id: number;
  date_added: string;
  date_modified: string;
  /** Place in the manual backlog order (1 = first); set exactly when the status is Backlog. */
  backlog_position: number | null;
  /** Kept out of the Library, Backlog and Reports until unhidden (Settings > Hidden games). */
  hidden: boolean;
};
export type Platform = {
  id: number;
  name: string;
  short_name: string;
  icon_path: string | null;
  sort_order: number;
  is_builtin: boolean;
};
export type Preferences = {
  library_view: string;
  cover_size: string;
  library_sort: string;
  // Absent until the user changes them.
  stats_open?: string;
  /** JSON of list-view column widths in pixels. */
  list_columns?: string;
  /** "color" (the default when absent) or "mono". */
  platform_icon_style?: string;
  /** Which collection is shown: "games" (the default when absent), "guides" or "hardware". */
  collection?: string;
  /** "grouped" (the default when absent) or "flat". */
  hardware_grouping?: string;
  /** "true" turns the reader's night mode on. */
  reader_night?: string;
  /** The reader's zoom: "page-width" (the default), "page-fit", "auto", or a number such as "1.25". */
  reader_zoom?: string;
  report_paper?: string;
  report_orientation?: string;
};
export const statuses = [
  "Not Started",
  "Backlog",
  "Playing",
  "Completed",
  "Paused",
  "Dropped",
];
export const emptyGame = (platform: number): GameInput => ({
  igdb_id: null,
  title: "",
  platform_id: platform,
  account: null,
  release_date: null,
  genre: null,
  developer: null,
  publisher: null,
  cover_path: null,
  media_type: "Physical",
  play_status: "Not Started",
  rating: null,
  notes_html: "",
  tags: [],
});

export type Collection = "games" | "guides" | "hardware";
export const collections: Array<{ id: Collection; name: string }> = [
  { id: "games", name: "Games" },
  { id: "guides", name: "Guides" },
  { id: "hardware", name: "Hardware" },
];
export const collectionOf = (value: string | undefined): Collection =>
  collections.find((c) => c.id === value)?.id ?? "games";

export type HardwareKind = "system" | "accessory";
export type HardwareInput = {
  kind: HardwareKind;
  name: string;
  platform_id: number | null;
  parent_id: number | null;
  manufacturer: string | null;
  model: string | null;
  region: string | null;
  serial: string | null;
  color: string | null;
  condition: string | null;
  completeness: string | null;
  status: string;
  is_working: boolean;
  is_modded: boolean;
  purchase_date: string | null;
  purchase_price_cents: number | null;
  purchase_source: string | null;
  sale_date: string | null;
  sale_price_cents: number | null;
  photo_path: string | null;
  notes_html: string;
  /** Extra platforms an accessory works with, besides its own platform. */
  compat_platform_ids: number[];
};
export type Hardware = HardwareInput & {
  id: number;
  /** Set when the accessory's system was deleted, or kept while the system went away. */
  former_parent_name: string | null;
  date_added: string;
  date_modified: string;
};
export const hardwareStatuses = ["Owned", "Sold", "Gifted", "Lost"];
export const hardwareConditions = [
  "New",
  "Like New",
  "Good",
  "Fair",
  "Poor",
  "For Parts",
];
export const hardwareCompleteness = [
  "Complete in box",
  "Missing box or manual",
  "Loose",
];
export const emptyHardware = (kind: HardwareKind): HardwareInput => ({
  kind,
  name: "",
  platform_id: null,
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
  compat_platform_ids: [],
});

export type GuideInput = {
  title: string;
  game_id: number | null;
  /** The game's name when it is not one in the Library. */
  game_title: string | null;
  platform_id: number | null;
  author: string | null;
  publisher: string | null;
  edition: string | null;
  isbn: string | null;
  language: string | null;
  page_count: number | null;
  has_physical: boolean;
  condition: string | null;
  purchase_date: string | null;
  purchase_price_cents: number | null;
  purchase_source: string | null;
  photo_path: string | null;
  notes_html: string;
};
/** A digital copy (PDF or ePub) of a guide, kept in the app's own folder. */
export type GuideFile = {
  id: number;
  guide_id: number;
  /** The original file name, for display. */
  file_name: string;
  kind: "pdf" | "epub";
  size_bytes: number;
  source_url: string | null;
  date_added: string;
  /** The copy in the app folder is gone (for example after restoring a backup without guide files). */
  missing: boolean;
  /** Where the reader stopped, and when the file was last opened in it. */
  last_page: number | null;
  last_opened_at: string | null;
};
export type Guide = GuideInput & {
  id: number;
  date_added: string;
  date_modified: string;
  files: GuideFile[];
};
export const emptyGuide = (): GuideInput => ({
  title: "",
  game_id: null,
  game_title: null,
  platform_id: null,
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
});
