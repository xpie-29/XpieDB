import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@fluentui/react-components";
import { Add20Regular, Note20Regular } from "@fluentui/react-icons";
import type { Game, Platform, Preferences } from "../types";
import { ManagedImage, PlatformIcon } from "./Shared";
import { meaningfulNotes } from "../notes";
import { StarRating } from "./StarRating";

export function Library({
  games,
  total,
  filtered,
  clear,
  platforms,
  preferences,
  selected,
  select,
  add,
  utilityBar,
  statsPanel,
  details,
}: {
  games: Game[];
  total: number;
  filtered: boolean;
  clear: () => void;
  platforms: Platform[];
  preferences: Preferences;
  selected: number | null;
  select: (id: number) => void;
  add: () => void;
  utilityBar?: ReactNode;
  statsPanel?: ReactNode;
  details: ReactNode;
}) {
  const entries = useRef<Array<HTMLElement | null>>([]);
  const grid = useRef<HTMLDivElement>(null);
  function keyboard(e: KeyboardEvent, index: number, isGrid: boolean) {
    let columns = 1;
    if (isGrid && grid.current)
      columns = Math.max(
        1,
        getComputedStyle(grid.current).gridTemplateColumns.split(" ").length,
      );
    let next = index;
    switch (e.key) {
      case "ArrowRight":
        if (!isGrid) return;
        next++;
        break;
      case "ArrowLeft":
        if (!isGrid) return;
        next--;
        break;
      case "ArrowDown":
        next += columns;
        break;
      case "ArrowUp":
        next -= columns;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = games.length - 1;
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        select(games[index].id);
        return;
      default:
        return;
    }
    e.preventDefault();
    next = Math.max(0, Math.min(games.length - 1, next));
    select(games[next].id);
    entries.current[next]?.focus();
  }
  return (
    <div className="library-view">
      {(utilityBar || statsPanel) && (
        <div className="library-utility">
          {utilityBar}
          {statsPanel}
        </div>
      )}
      <div className="library-workspace">
        <section
          className="library-pane"
          aria-label="Library content"
          tabIndex={-1}
        >
          <div className="library-summary">
            <h1>Library</h1>
            <span className="muted" role="status">
              {filtered
                ? `${games.length} of ${total} games`
                : `${total} ${total === 1 ? "game" : "games"}`}
            </span>
          </div>
          {!games.length ? (
            <div className="empty">
              <h2>
                {total
                  ? "No games match the current search and filters."
                  : "No games yet"}
              </h2>
              <Button
                icon={total ? undefined : <Add20Regular />}
                onClick={total ? clear : add}
              >
                {total ? "Clear All Filters" : "Add Game"}
              </Button>
            </div>
          ) : preferences.library_view === "grid" ? (
            <div
              ref={grid}
              className={`cover-grid size-${preferences.cover_size}`}
              role="group"
              aria-label="Game covers"
            >
              {games.map((g, i) => (
                <button
                  ref={(el) => {
                    entries.current[i] = el;
                  }}
                  key={g.id}
                  className={`game-card ${selected === g.id ? "selected" : ""}`}
                  aria-pressed={selected === g.id}
                  tabIndex={selected === g.id ? 0 : -1}
                  onClick={() => select(g.id)}
                  onKeyDown={(e) => keyboard(e, i, true)}
                >
                  <ManagedImage
                    path={g.cover_path}
                    alt={`${g.title} cover`}
                    className="cover"
                  />
                  <strong>{g.title}</strong>
                  <span className="muted">
                    {platforms.find((p) => p.id === g.platform_id)?.name}
                  </span>
                  <span className="status">{g.play_status}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="game-list" role="grid" aria-label="Game library">
              <div className="list-row list-heading" role="row">
                <span role="columnheader">Platform</span>
                <span role="columnheader">Title</span>
                <span role="columnheader">Genre</span>
                <span role="columnheader">Media</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Rating</span>
                <span role="columnheader" aria-label="Notes">
                  <Note20Regular title="Notes" />
                </span>
              </div>
              {games.map((g, i) => (
                <div
                  ref={(el) => {
                    entries.current[i] = el;
                  }}
                  key={g.id}
                  className={`list-row ${selected === g.id ? "selected" : ""}`}
                  role="row"
                  aria-selected={selected === g.id}
                  tabIndex={selected === g.id ? 0 : -1}
                  onClick={() => select(g.id)}
                  onKeyDown={(e) => keyboard(e, i, false)}
                >
                  <span role="gridcell">
                    <PlatformIcon
                      platform={platforms.find((p) => p.id === g.platform_id)}
                    />
                  </span>
                  <span role="gridcell" title={g.title}>
                    {g.title}
                  </span>
                  <span role="gridcell" title={g.genre ?? ""}>
                    {g.genre ?? "-"}
                  </span>
                  <span role="gridcell">{g.media_type}</span>
                  <span role="gridcell">{g.play_status}</span>
                  <span role="gridcell">
                    <StarRating value={g.rating} compact />
                  </span>
                  <span role="gridcell">
                    {meaningfulNotes(g.notes_html) && (
                      <Note20Regular aria-label="Has notes" title="Has notes" />
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
        {details}
      </div>
    </div>
  );
}
