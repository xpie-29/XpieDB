import { useMemo, useRef, useState, type ReactNode } from "react";
import type { FocusEvent, PointerEvent } from "react";
import { Button, Tab, TabList } from "@fluentui/react-components";
import {
  ChevronDown20Regular,
  ChevronUp20Regular,
  DataBarVertical20Regular,
  Table20Regular,
} from "@fluentui/react-icons";
import type { Game, Platform } from "../types";
import { computeStats, foldTail, formatPct, type Share } from "../stats";

const plural = (n: number, word = "game") =>
  `${n} ${word}${n === 1 ? "" : "s"}`;

// Each status keeps its color whatever the counts, in the validated slot order.
const statusColor: Record<string, string> = {
  Completed: "var(--viz-1)",
  Playing: "var(--viz-2)",
  "Not Started": "var(--viz-3)",
  Paused: "var(--viz-4)",
  Dropped: "var(--viz-5)",
  Backlog: "var(--viz-6)",
  Other: "var(--viz-other)",
};

type Bind = (value: string, label: string) => Record<string, unknown>;
type Tip = { value: string; label: string; x: number; y: number } | null;

/** Hover and keyboard-focus tooltip shared by every mark in one card. */
function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const ref = useRef<HTMLDivElement>(null);
  const show = (
    element: Element,
    value: string,
    label: string,
    pointer?: { x: number; y: number },
  ) => {
    const card = ref.current?.getBoundingClientRect();
    if (!card) return;
    const box = element.getBoundingClientRect();
    const x = pointer ? pointer.x : box.left + box.width / 2;
    const y = pointer ? pointer.y : box.top;
    setTip({
      value,
      label,
      x: Math.min(Math.max(x - card.left, 70), card.width - 70),
      y: y - card.top,
    });
  };
  const bind: Bind = (value, label) => ({
    tabIndex: 0,
    "aria-label": `${label}: ${value}`,
    onPointerMove: (e: PointerEvent) =>
      show(e.currentTarget, value, label, { x: e.clientX, y: e.clientY }),
    onPointerLeave: () => setTip(null),
    onFocus: (e: FocusEvent) => show(e.currentTarget, value, label),
    onBlur: () => setTip(null),
  });
  return { tip, ref, bind };
}

function Tile({
  label,
  value,
  sub,
  children,
}: {
  label: string;
  value: string;
  sub: string;
  children?: ReactNode;
}) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-sub">{sub}</span>
      {children}
    </div>
  );
}

/** A card with a chart and its table twin, so no value is hover-only. */
function ChartCard({
  title,
  controls,
  rows,
  firstColumn,
  note,
  children,
}: {
  title: string;
  controls?: ReactNode;
  rows: Share[];
  firstColumn: string;
  note?: string;
  children: (bind: Bind) => ReactNode;
}) {
  const [table, setTable] = useState(false);
  const { tip, ref, bind } = useTip();
  return (
    <div className="chart-card" ref={ref}>
      <div className="chart-head">
        <h3 className="chart-title">{title}</h3>
        <Button
          size="small"
          appearance="subtle"
          icon={table ? <DataBarVertical20Regular /> : <Table20Regular />}
          aria-label={`${title}: ${table ? "show chart" : "show as table"}`}
          title={table ? "Show chart" : "Show as table"}
          onClick={() => setTable(!table)}
        />
      </div>
      {controls}
      {table ? (
        <table className="stats-table">
          <thead>
            <tr>
              <th scope="col">{firstColumn}</th>
              <th scope="col">Games</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td>{r.count}</td>
                <td>{formatPct(r.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        children(bind)
      )}
      {note && table && <p className="chart-note">{note}</p>}
      {tip && (
        <div
          className="chart-tip"
          role="tooltip"
          style={{ left: tip.x, top: tip.y }}
        >
          <strong>{tip.value}</strong>
          <span>{tip.label}</span>
        </div>
      )}
    </div>
  );
}

function BarList({ rows, bind }: { rows: Share[]; bind: Bind }) {
  const max = Math.max(...rows.map((r) => r.pct), 0.0001);
  return (
    <ul className="bar-list">
      {rows.map((r) => (
        <li
          key={r.key}
          {...bind(formatPct(r.pct), `${r.label} · ${plural(r.count)}`)}
        >
          <span className="bar-label" title={r.label}>
            {r.label}
          </span>
          <span className="bar-track">
            <span
              className={`bar${r.key === "other" ? " bar-other" : ""}`}
              style={{
                width: `${Math.max((r.pct / max) * 100, r.count ? 1.5 : 0)}%`,
              }}
            />
          </span>
          <span className="bar-value">{formatPct(r.pct)}</span>
        </li>
      ))}
    </ul>
  );
}

function StatusBar({ rows, bind }: { rows: Share[]; bind: Bind }) {
  return (
    <>
      <div className="stack">
        {rows
          .filter((r) => r.count > 0)
          .map((r) => (
            <div
              key={r.key}
              role="img"
              className="stack-segment"
              style={{ flexGrow: r.count, background: statusColor[r.label] }}
              {...bind(formatPct(r.pct), `${r.label} · ${plural(r.count)}`)}
            />
          ))}
      </div>
      <ul className="legend">
        {rows.map((r) => (
          <li key={r.key}>
            <span
              className="swatch"
              style={{ background: statusColor[r.label] }}
              aria-hidden="true"
            />
            <span className="legend-name">{r.label}</span>
            <span className="legend-count">{r.count}</span>
            <span className="legend-pct">{formatPct(r.pct)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Columns({ rows, bind }: { rows: Share[]; bind: Bind }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  const peak = rows.reduce((a, r) => (r.count > a.count ? r : a), rows[0]);
  // Label every cap on short charts; otherwise only the tallest.
  const labelAll = rows.length <= 8;
  return (
    <div className="columns" role="list">
      {rows.map((r) => (
        <div
          key={r.key}
          role="listitem"
          className="column"
          {...bind(`${formatPct(r.pct)}`, `${r.label} · ${plural(r.count)}`)}
        >
          <span className="column-value">
            {r.count > 0 && (labelAll || r === peak) ? r.count : ""}
          </span>
          <span className="column-plot">
            <span
              className={`column-bar${["unrated", "unknown"].includes(r.key) ? " bar-other" : ""}`}
              style={{
                height: `${Math.max((r.count / max) * 100, r.count ? 3 : 0)}%`,
              }}
            />
          </span>
          <span className="column-label">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

const moreTabs = [
  ["genre", "Genre"],
  ["decade", "Decade"],
  ["rating", "Rating"],
  ["added", "Added"],
  ["developer", "Developer"],
] as const;
type MoreTab = (typeof moreTabs)[number][0];

export function StatsPanel({
  games,
  allCount,
  platforms,
  filtered,
  open,
  setOpen,
}: {
  games: Game[];
  allCount: number;
  platforms: Platform[];
  filtered: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const stats = useMemo(
    () => computeStats(games, platforms),
    [games, platforms],
  );
  const [tab, setTab] = useState<MoreTab>("genre");
  const platformRows = useMemo(
    () => foldTail(stats.byPlatform, 5, "platforms"),
    [stats.byPlatform],
  );
  const scope = filtered
    ? `${stats.total} of ${allCount} games (filtered)`
    : plural(stats.total);
  const summary = stats.total
    ? [
        scope,
        `${formatPct(stats.completedPct)} completed`,
        plural(stats.platformCount, "platform"),
        stats.averageRating !== null
          ? `${stats.averageRating.toFixed(1)} average rating`
          : null,
      ]
        .filter(Boolean)
        .join("  ·  ")
    : "No games match the current search and filters.";

  const more: {
    rows: Share[];
    first: string;
    kind: "bars" | "columns";
    note?: string;
  } = {
    genre: {
      rows: stats.genres.slice(0, 6),
      first: "Genre",
      kind: "bars" as const,
      note: "A game counts once in each of its genres.",
    },
    decade: { rows: stats.decades, first: "Decade", kind: "columns" as const },
    rating: { rows: stats.ratings, first: "Rating", kind: "columns" as const },
    added: {
      rows: stats.addedYears,
      first: "Year added",
      kind: "columns" as const,
    },
    developer: {
      rows: stats.developers.slice(0, 6),
      first: "Developer",
      kind: "bars" as const,
      note: "A game counts once for each of its developers.",
    },
  }[tab];

  return (
    <section className="stats-ribbon" aria-label="Collection statistics">
      <div className="stats-header">
        <Button
          appearance="subtle"
          size="small"
          icon={open ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
          aria-expanded={open}
          aria-controls="stats-body"
          onClick={() => setOpen(!open)}
        >
          Statistics
        </Button>
        <span className="stats-summary">
          {open
            ? filtered
              ? `Showing the ${stats.total} of ${allCount} games that match your search and filters.`
              : "Showing your whole library."
            : summary}
        </span>
      </div>
      {open && (
        <div className="stats-body" id="stats-body">
          {!stats.total ? (
            <p className="muted">
              No games match the current search and filters.
            </p>
          ) : (
            <>
              <div className="stat-tiles">
                <Tile
                  label="Games"
                  value={String(stats.total)}
                  sub={filtered ? `of ${allCount} in library` : "in library"}
                />
                <Tile
                  label="Completed"
                  value={formatPct(stats.completedPct)}
                  sub={plural(
                    stats.byStatus.find((s) => s.key === "Completed")?.count ??
                      0,
                  )}
                />
                <Tile
                  label="Backlog"
                  value={String(stats.backlog)}
                  sub={`${stats.notStarted} not started`}
                />
                <Tile
                  label="Average rating"
                  value={
                    stats.averageRating === null
                      ? "—"
                      : `${stats.averageRating.toFixed(1)} / 5`
                  }
                  sub={`${stats.rated} rated`}
                />
                <Tile
                  label="Platforms"
                  value={String(stats.platformCount)}
                  sub="in use"
                />
                <Tile
                  label="Format"
                  value={`${formatPct((stats.physical / stats.total) * 100)} physical`}
                  sub={`${formatPct((stats.digital / stats.total) * 100)} digital`}
                >
                  <span
                    className="meter"
                    role="img"
                    aria-label={`${stats.physical} physical, ${stats.digital} digital`}
                  >
                    <span
                      className="meter-fill"
                      style={{
                        width: `${(stats.physical / stats.total) * 100}%`,
                      }}
                    />
                  </span>
                </Tile>
              </div>
              <div className="chart-grid">
                <ChartCard
                  title="Games by platform"
                  rows={stats.byPlatform}
                  firstColumn="Platform"
                >
                  {(bind) => <BarList rows={platformRows} bind={bind} />}
                </ChartCard>
                <ChartCard
                  title="Games by play status"
                  rows={stats.byStatus}
                  firstColumn="Status"
                >
                  {(bind) => <StatusBar rows={stats.byStatus} bind={bind} />}
                </ChartCard>
                <ChartCard
                  title="More breakdowns"
                  rows={more.rows}
                  firstColumn={more.first}
                  note={more.note}
                  controls={
                    <TabList
                      size="small"
                      selectedValue={tab}
                      onTabSelect={(_, d) => setTab(d.value as MoreTab)}
                    >
                      {moreTabs.map(([id, name]) => (
                        <Tab key={id} value={id}>
                          {name}
                        </Tab>
                      ))}
                    </TabList>
                  }
                >
                  {(bind) =>
                    more.rows.length === 0 ? (
                      <p className="muted">
                        Nothing recorded for these games yet.
                      </p>
                    ) : more.kind === "bars" ? (
                      <BarList rows={more.rows} bind={bind} />
                    ) : (
                      <Columns rows={more.rows} bind={bind} />
                    )
                  }
                </ChartCard>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
