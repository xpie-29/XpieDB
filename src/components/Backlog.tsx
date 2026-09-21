import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Checkbox, Input } from "@fluentui/react-components";
import {
  Add20Regular,
  ArrowCircleUp20Regular,
  Dismiss20Regular,
  Edit20Regular,
  Play20Regular,
  ReOrderDotsVertical20Regular,
} from "@fluentui/react-icons";
import type { Game, Platform } from "../types";
import { clampIndex, moved } from "../listOrder";
import { ManagedImage, Modal, PlatformIcon } from "./Shared";

const plural = (n: number, word = "game") =>
  `${n} ${word}${n === 1 ? "" : "s"}`;

type Drag = { id: number; from: number; over: number };

export function Backlog({
  games,
  platforms,
  refresh,
  edit,
}: {
  games: Game[];
  platforms: Platform[];
  refresh: () => Promise<void>;
  edit: (id: number) => void;
}) {
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const saved = useMemo(
    () =>
      games
        .filter((g) => g.backlog_position != null)
        .sort(
          (a, b) =>
            (a.backlog_position ?? 0) - (b.backlog_position ?? 0) ||
            a.id - b.id,
        )
        .map((g) => g.id),
    [games],
  );
  // While a change is being saved the screen shows the order the user asked for.
  const [pending, setPending] = useState<number[] | null>(null);
  const order = pending ?? saved;
  const [drag, setDrag] = useState<Drag | null>(null);
  const shown = drag ? moved(order, drag.from, drag.over) : order;
  const [error, setError] = useState("");
  const [announce, setAnnounce] = useState("");
  const [adding, setAdding] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const pointerY = useRef(0);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const version = useRef(0);
  const refocus = useRef<number | null>(null);

  // Keyboard moves re-render the row; put focus back on its handle.
  useLayoutEffect(() => {
    if (refocus.current === null) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-handle="${refocus.current}"]`)
      ?.focus();
    refocus.current = null;
  });

  /** Saves a full order. Saves run one at a time; the last one wins. */
  function commit(next: number[]) {
    setPending(next);
    setError("");
    const mine = ++version.current;
    saving.current = saving.current
      .then(() => invoke("backlog_set_order", { ids: next }))
      .then(async () => {
        if (mine !== version.current) return;
        await refresh();
        setPending(null);
      })
      .catch(async (e) => {
        setError(String(e));
        if (mine !== version.current) return;
        await refresh().catch(() => {});
        setPending(null);
      });
  }
  const platform = (game: Game) =>
    platforms.find((p) => p.id === game.platform_id);

  function moveTo(id: number, to: number) {
    const from = order.indexOf(id);
    const target = clampIndex(to, order.length);
    if (from < 0 || from === target) return;
    refocus.current = id;
    setAnnounce(
      `Moved ${byId.get(id)?.title} to position ${target + 1} of ${order.length}.`,
    );
    commit(moved(order, from, target));
  }
  function key(e: KeyboardEvent, id: number) {
    const at = order.indexOf(id);
    const to =
      e.key === "ArrowUp"
        ? at - 1
        : e.key === "ArrowDown"
          ? at + 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? order.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    moveTo(id, to);
  }

  // Pointer dragging. The list itself holds the pointer capture, so the
  // captured element is not moved in the DOM while rows shuffle.
  function overIndex(clientY: number) {
    const rows = Array.from(list.current?.children ?? []);
    const i = rows.findIndex(
      (row) => clientY < row.getBoundingClientRect().bottom,
    );
    return i < 0 ? rows.length - 1 : i;
  }
  function begin(e: PointerEvent, id: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    list.current?.setPointerCapture(e.pointerId);
    pointerY.current = e.clientY;
    const from = order.indexOf(id);
    setDrag({ id, from, over: from });
  }
  function track(e: PointerEvent) {
    if (!drag) return;
    pointerY.current = e.clientY;
    const over = overIndex(e.clientY);
    if (over !== drag.over) setDrag({ ...drag, over });
  }
  function finish(e: PointerEvent, cancelled = false) {
    if (!drag) return;
    if (list.current?.hasPointerCapture(e.pointerId))
      list.current.releasePointerCapture(e.pointerId);
    const { id, from, over } = drag;
    setDrag(null);
    if (!cancelled && from !== over) {
      setAnnounce(
        `Moved ${byId.get(id)?.title} to position ${over + 1} of ${order.length}.`,
      );
      commit(moved(order, from, over));
    }
  }
  // Scroll the page while dragging near its top or bottom edge.
  useEffect(() => {
    if (!drag) return;
    const scroller = list.current?.closest<HTMLElement>(".page-scroll");
    if (!scroller) return;
    const timer = window.setInterval(() => {
      const box = scroller.getBoundingClientRect();
      const y = pointerY.current;
      const edge = 56;
      const speed = y < box.top + edge ? -14 : y > box.bottom - edge ? 14 : 0;
      if (!speed) return;
      scroller.scrollTop += speed;
      const over = overIndex(y);
      setDrag((d) => (d && d.over !== over ? { ...d, over } : d));
    }, 16);
    return () => window.clearInterval(timer);
  }, [drag !== null]);

  async function act(run: () => Promise<unknown>) {
    setError("");
    try {
      await run();
      await refresh();
    } catch (e) {
      setError(String(e));
      await refresh().catch(() => {});
    }
  }

  return (
    <div className="backlog">
      <header className="page-header">
        <div>
          <h1>Backlog</h1>
          <p className="muted backlog-hint">
            {order.length
              ? `${plural(order.length)} in your order. Drag the handle, or focus it and press the up and down arrow keys (Home and End for top and bottom).`
              : "Games with the Backlog status appear here, in an order you set by hand."}
          </p>
        </div>
        <Button icon={<Add20Regular />} onClick={() => setAdding(true)}>
          Add games...
        </Button>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      {order.length === 0 ? (
        <div className="empty">
          <h2>Your backlog is empty</h2>
          <p className="muted">
            Set a game's play status to Backlog, or add several games at once.
          </p>
          <Button icon={<Add20Regular />} onClick={() => setAdding(true)}>
            Add games...
          </Button>
        </div>
      ) : (
        <ol
          ref={list}
          className={`backlog-list${drag ? " is-dragging" : ""}`}
          onPointerMove={track}
          onPointerUp={finish}
          onPointerCancel={(e) => finish(e, true)}
        >
          {shown.map((id, index) => {
            const game = byId.get(id);
            if (!game) return null;
            const p = platform(game);
            return (
              <li
                key={id}
                className={`backlog-row${drag?.id === id ? " dragging" : ""}`}
                data-id={id}
              >
                <span
                  className="backlog-number"
                  aria-label={`Position ${index + 1}`}
                >
                  {index + 1}
                </span>
                <button
                  type="button"
                  className="backlog-handle"
                  data-handle={id}
                  aria-label={`Reorder ${game.title}, position ${index + 1} of ${shown.length}. Use the arrow keys to move.`}
                  onPointerDown={(e) => begin(e, id)}
                  onKeyDown={(e) => key(e, id)}
                >
                  <ReOrderDotsVertical20Regular />
                </button>
                <ManagedImage
                  path={game.cover_path}
                  alt=""
                  className="backlog-cover"
                />
                <div className="backlog-main">
                  <span className="backlog-title" title={game.title}>
                    {game.title}
                  </span>
                  <span className="backlog-meta">
                    <PlatformIcon platform={p} />
                    <span>{p?.name ?? "Unknown platform"}</span>
                    {game.release_date && (
                      <span>· {game.release_date.slice(0, 4)}</span>
                    )}
                    {game.genre && <span>· {game.genre}</span>}
                  </span>
                </div>
                <div className="backlog-actions">
                  <Button
                    appearance="subtle"
                    icon={<ArrowCircleUp20Regular />}
                    title="Move to top"
                    aria-label={`Move ${game.title} to top`}
                    disabled={index === 0}
                    onClick={() => moveTo(id, 0)}
                  />
                  <Button
                    appearance="subtle"
                    icon={<Play20Regular />}
                    title="Start playing (sets status to Playing)"
                    aria-label={`Start playing ${game.title}`}
                    onClick={() =>
                      void act(() =>
                        invoke("backlog_remove", { id, status: "Playing" }),
                      )
                    }
                  />
                  <Button
                    appearance="subtle"
                    icon={<Edit20Regular />}
                    title="Edit game"
                    aria-label={`Edit ${game.title}`}
                    onClick={() => edit(id)}
                  />
                  <Button
                    appearance="subtle"
                    icon={<Dismiss20Regular />}
                    title="Remove from backlog (sets status to Not Started)"
                    aria-label={`Remove ${game.title} from backlog`}
                    onClick={() =>
                      void act(() =>
                        invoke("backlog_remove", { id, status: "Not Started" }),
                      )
                    }
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {adding && (
        <AddGames
          games={games.filter((g) => g.backlog_position == null)}
          platforms={platforms}
          close={() => setAdding(false)}
          add={async (ids) => {
            await act(() => invoke("backlog_add", { ids }));
            setAnnounce(`Added ${plural(ids.length)} to the backlog.`);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

const LIMIT = 200;

function AddGames({
  games,
  platforms,
  close,
  add,
}: {
  games: Game[];
  platforms: Platform[];
  close: () => void;
  add: (ids: number[]) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const names = useMemo(
    () => new Map(platforms.map((p) => [p.id, p.name])),
    [platforms],
  );
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = games.filter((g) => {
    const haystack =
      `${g.title} ${names.get(g.platform_id) ?? ""}`.toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
  return (
    <Modal
      title="Add games to the backlog"
      close={() => {
        if (!busy) close();
      }}
      actions={
        <>
          <Button disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button
            appearance="primary"
            disabled={busy || chosen.length === 0}
            onClick={() => {
              setBusy(true);
              void add(chosen).finally(() => setBusy(false));
            }}
          >
            {chosen.length
              ? `Add ${plural(chosen.length)} to backlog`
              : "Add to backlog"}
          </Button>
        </>
      }
    >
      <div className="add-games">
        <Input
          aria-label="Search games to add"
          placeholder="Search by title or platform"
          value={query}
          onChange={(_, d) => setQuery(d.value)}
        />
        <p className="muted" role="status">
          {games.length === 0
            ? "Every game is already in the backlog."
            : `${plural(matches.length)} available. Games are added to the bottom in the order you tick them; their status becomes Backlog.`}
        </p>
        <ul className="add-list">
          {matches.slice(0, LIMIT).map((g) => (
            <li key={g.id}>
              <Checkbox
                checked={chosen.includes(g.id)}
                label={`${g.title} - ${names.get(g.platform_id) ?? "Unknown platform"} (${g.play_status})`}
                onChange={(_, d) =>
                  setChosen((c) =>
                    d.checked ? [...c, g.id] : c.filter((id) => id !== g.id),
                  )
                }
              />
            </li>
          ))}
        </ul>
        {matches.length > LIMIT && (
          <p className="muted">
            Showing the first {LIMIT}. Search to narrow the list.
          </p>
        )}
      </div>
    </Modal>
  );
}
