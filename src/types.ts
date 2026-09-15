export type GameInput = {
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
  igdb_id: number | null;
  date_added: string;
  date_modified: string;
};
export type Platform = {
  id: number;
  name: string;
  short_name: string;
  icon_path: string | null;
  sort_order: number;
  is_builtin: boolean;
};
export type Preferences = { library_view: string; cover_size: string };
export const statuses = [
  "Not Started",
  "Playing",
  "Completed",
  "Paused",
  "Dropped",
];
export const emptyGame = (platform: number): GameInput => ({
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
