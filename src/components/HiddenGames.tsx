import { useEffect, useState } from "react";
import { Button, Checkbox } from "@fluentui/react-components";
import type { Game, Platform } from "../types";
import { PlatformIcon } from "./Shared";

/** Settings section: games hidden from the Library, with a multi-select list to unhide them. */
export function HiddenGames({
  games,
  platforms,
  unhide,
}: {
  games: Game[];
  platforms: Platform[];
  unhide: (games: Game[]) => Promise<void>;
}) {
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState(false);
  // Forget picks for games that are no longer hidden.
  useEffect(() => {
    setPicked((current) => {
      const ids = new Set(games.map((g) => g.id));
      const kept = [...current].filter((id) => ids.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [games]);
  const toggle = (id: number, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const all = games.length > 0 && picked.size === games.length;
  return (
    <section className="hidden-games" aria-labelledby="hidden-games-title">
      <h2 id="hidden-games-title">Hidden games</h2>
      {!games.length ? (
        <p className="muted">
          No hidden games. Use the hide button in a game&apos;s details to keep
          it out of the Library, Backlog and reports.
        </p>
      ) : (
        <>
          <p>
            {games.length} hidden {games.length === 1 ? "game is" : "games are"}{" "}
            kept out of the Library, Backlog and reports. Pick the ones to
            bring back.
          </p>
          <ul aria-label="Hidden games">
            {games.map((g) => (
              <li key={g.id} className={picked.has(g.id) ? "picked" : undefined}>
                <Checkbox
                  checked={picked.has(g.id)}
                  onChange={(_, d) => toggle(g.id, d.checked === true)}
                  label={g.title}
                />
                <PlatformIcon
                  platform={platforms.find((p) => p.id === g.platform_id)}
                />
              </li>
            ))}
          </ul>
          <div className="actions">
            <Button
              appearance="primary"
              disabled={!picked.size || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await unhide(games.filter((g) => picked.has(g.id)));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {`Unhide selected (${picked.size})`}
            </Button>
            <Button
              appearance="subtle"
              onClick={() =>
                setPicked(all ? new Set() : new Set(games.map((g) => g.id)))
              }
            >
              {all ? "Select none" : "Select all"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
