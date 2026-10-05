import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Button } from "@fluentui/react-components";
import { Add20Regular, Note20Regular } from "@fluentui/react-icons";
import type { Game, Platform, Preferences } from "../types";
import { ManagedImage, PlatformIcon } from "./Shared";
import { meaningfulNotes } from "../notes";
import { StarRating } from "./StarRating";
import {
  clampWidth,
  defaultWidths,
  gridTemplate,
  listColumns,
  parseWidths,
  serializeWidths,
  totalWidth,
  type ColumnKey,
  type ColumnWidths,
} from "../listColumns";

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
  scroll,
  highlight,
  setPreference,
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
  /** Remembers the pane's scroll position across visits to other screens. */
  scroll: { current: number };
  /** A game to flash briefly, e.g. the one just edited. */
  highlight?: number | null;
  setPreference: (key: string, value: string) => void;
  utilityBar?: ReactNode;
  statsPanel?: ReactNode;
  details: ReactNode;
}) {
  const entries = useRef<Array<HTMLElement | null>>([]);
  const grid = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (pane.current) pane.current.scrollTop = scroll.current;
    // Restore once, when the Library is shown again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const saved = useMemo(
    () => parseWidths(preferences.list_columns),
    [preferences.list_columns],
  );
  // Width being dragged; the saved value is written once, when the drag ends.
  const [live, setLive] = useState<Partial<ColumnWidths>>({});
  const widths = { ...saved, ...live } as ColumnWidths;
  const customized = serializeWidths(saved) !== serializeWidths(defaultWidths());
  const commit = (next: ColumnWidths) => {
    setLive({});
    if (serializeWidths(next) !== serializeWidths(saved))
      setPreference("list_columns", serializeWidths(next));
  };
  const resizeStart = (e: PointerEvent<HTMLElement>, key: ColumnKey) => {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const start = widths[key];
    let latest = start;
    const move = (m: globalThis.PointerEvent) => {
      latest = clampWidth(key, start + m.clientX - startX);
      setLive({ [key]: latest });
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      commit({ ...widths, [key]: latest });
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };
  // Double-click: fit the widest cell in the column (the heading counts too).
  const autoFit = (key: ColumnKey) => {
    const index = listColumns.findIndex((c) => c.key === key);
    let widest = 0;
    list.current
      ?.querySelectorAll<HTMLElement>(`.list-row > :nth-child(${index + 1})`)
      .forEach((cell) => {
        // A cell is as wide as its column, so measure what is inside it.
        const range = document.createRange();
        range.selectNodeContents(cell);
        const handle = cell.querySelector(".col-handle");
        if (handle) range.setEndBefore(handle);
        widest = Math.max(widest, range.getBoundingClientRect().width);
      });
    commit({ ...widths, [key]: clampWidth(key, widest + 12) });
  };
  const resizeKey = (e: KeyboardEvent, key: ColumnKey) => {
    const step = e.shiftKey ? 40 : 10;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = clampWidth(
      key,
      widths[key] + (e.key === "ArrowRight" ? step : -step),
    );
    commit({ ...widths, [key]: next });
  };
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
          ref={pane}
          onScroll={(e) => {
            scroll.current = e.currentTarget.scrollTop;
          }}
        >
          <div className="library-summary">
            <h1>Library</h1>
            <span className="muted" role="status">
              {filtered
                ? `${games.length} of ${total} games`
                : `${total} ${total === 1 ? "game" : "games"}`}
            </span>
            {preferences.library_view === "list" && customized && (
              <Button
                size="small"
                appearance="subtle"
                onClick={() => {
                  setLive({});
                  setPreference("list_columns", serializeWidths(defaultWidths()));
                }}
              >
                Reset columns
              </Button>
            )}
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
                  className={`game-card ${selected === g.id ? "selected" : ""} ${highlight === g.id ? "just-edited" : ""}`}
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
            <div
              ref={list}
              className="game-list"
              role="grid"
              aria-label="Game library"
              style={
                {
                  "--list-columns": gridTemplate(widths),
                  "--list-width": `${totalWidth(widths) + 72}px`,
                } as CSSProperties
              }
            >
              <div className="list-row list-heading" role="row">
                {listColumns.map((c) => (
                  <span role="columnheader" key={c.key} className="col-head">
                    {c.key === "notes" ? (
                      <Note20Regular title="Notes" aria-label="Notes" />
                    ) : (
                      c.label
                    )}
                    <span
                      className="col-handle"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${c.label} column`}
                      aria-valuenow={widths[c.key]}
                      aria-valuemin={c.min}
                      tabIndex={0}
                      onPointerDown={(e) => resizeStart(e, c.key)}
                      onDoubleClick={() => autoFit(c.key)}
                      onKeyDown={(e) => resizeKey(e, c.key)}
                    />
                  </span>
                ))}
              </div>
              {games.map((g, i) => (
                <div
                  ref={(el) => {
                    entries.current[i] = el;
                  }}
                  key={g.id}
                  className={`list-row ${selected === g.id ? "selected" : ""} ${highlight === g.id ? "just-edited" : ""}`}
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
