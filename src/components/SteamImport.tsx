import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  Field,
  Input,
  ProgressBar,
  Spinner,
} from "@fluentui/react-components";
import {
  ArrowLeft20Regular,
  ArrowDownload20Regular,
} from "@fluentui/react-icons";
import {
  chunk,
  defaultSelection,
  filterItems,
  playtime,
  selectedInOrder,
  summarize,
  type Outcome,
  type SteamLibrary,
} from "../steamImport";

const plural = (n: number, word = "game") =>
  `${n} ${word}${n === 1 ? "" : "s"}`;
/** Games sent to Rust per call, so progress can be shown and stopping is quick. */
const GROUP = 10;
type Phase = "start" | "loading" | "review" | "importing" | "done";

export function SteamImport({
  refresh,
  working,
  close,
  openSettings,
}: {
  refresh: () => Promise<void>;
  working: (busy: boolean) => void;
  close: () => void;
  openSettings: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("start");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [library, setLibrary] = useState<SteamLibrary | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [backlog, setBacklog] = useState(false);
  const [account, setAccount] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [stopped, setStopped] = useState(false);
  const stop = useRef(false);

  useEffect(() => {
    invoke<{ configured: boolean }>("steam_config")
      .then((v) => setConfigured(v.configured))
      .catch((e) => {
        setConfigured(false);
        setError(String(e));
      });
    // Forget the loaded library when leaving.
    return () => {
      void invoke("steam_clear_cache").catch(() => {});
    };
  }, []);

  const items = library?.items ?? [];
  const shown = useMemo(() => filterItems(items, query), [items, query]);
  const chosen = selectedInOrder(items, selected);
  const alreadyHave = items.filter((i) => i.duplicate).length;
  const matched = items.filter((i) => i.matched).length;

  async function load() {
    setPhase("loading");
    setError("");
    working(true);
    try {
      const result = await invoke<SteamLibrary>("steam_load");
      setLibrary(result);
      setSelected(defaultSelection(result.items));
      setQuery("");
      setPhase("review");
    } catch (e) {
      setError(String(e));
      setPhase("start");
    } finally {
      working(false);
    }
  }
  async function run() {
    stop.current = false;
    setStopped(false);
    setDone(0);
    setError("");
    setPhase("importing");
    working(true);
    const all: Outcome[] = [];
    const titles = new Map(items.map((i) => [i.appid, i.title]));
    try {
      for (const group of chunk(chosen, GROUP)) {
        if (stop.current) {
          setStopped(true);
          break;
        }
        try {
          all.push(
            ...(await invoke<Outcome[]>("steam_import", {
              appids: group,
              options: {
                backlog_unplayed: backlog,
                account: account.trim() || null,
              },
            })),
          );
        } catch (e) {
          // Anything after a failed call was not attempted.
          all.push(
            ...group.map((appid) => ({
              appid,
              title: titles.get(appid) ?? String(appid),
              status: "failed" as const,
              message: String(e),
            })),
          );
          setStopped(true);
          break;
        }
        setDone(all.length);
      }
      await refresh().catch(() => {});
    } finally {
      working(false);
      setOutcomes(all);
      setPhase("done");
    }
  }

  const summary = summarize(outcomes);
  const problems = outcomes.filter((o) => o.status === "failed");

  return (
    <div className="steam-import">
      <header className="page-header">
        <h1>Import from Steam</h1>
        <Button
          icon={<ArrowLeft20Regular />}
          disabled={phase === "loading" || phase === "importing"}
          onClick={close}
        >
          Library
        </Button>
      </header>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {phase === "start" && (
        <section>
          <p className="muted">
            Adds the games on your Steam account to XpieDB as digital Steam
            games, with covers and details from IGDB. Games you already have are
            skipped and never changed, so you can run this again later to pick
            up new purchases.
          </p>
          {configured === false ? (
            <>
              <p role="status">
                Steam is not set up yet. Add your API key and profile in
                Settings first.
              </p>
              <Button appearance="primary" onClick={openSettings}>
                Open Settings
              </Button>
            </>
          ) : (
            <Button
              appearance="primary"
              icon={<ArrowDownload20Regular />}
              disabled={configured === null}
              onClick={() => void load()}
            >
              Load my Steam library
            </Button>
          )}
        </section>
      )}

      {phase === "loading" && (
        <Spinner label="Loading your Steam library and matching it with IGDB. This can take a minute for a large library." />
      )}

      {phase === "review" && library && (
        <section>
          <p role="status">
            {library.account_name ? `${library.account_name}: ` : ""}
            {plural(items.length)} on Steam. {matched} matched on IGDB
            {alreadyHave ? `, ${alreadyHave} already in your library` : ""}.
          </p>
          {!library.matching_available && (
            <p className="muted">
              IGDB is not set up, so games will be added with their Steam titles
              only. Add your IGDB credentials in Settings to get covers and
              details.
            </p>
          )}
          {library.matching_available && items.length > matched && (
            <p className="muted">
              Games IGDB does not know are added with their Steam title only.
            </p>
          )}
          <div className="steam-options">
            <label className="steam-check">
              <input
                type="checkbox"
                checked={backlog}
                onChange={(e) => setBacklog(e.target.checked)}
              />
              Add games I have never played to my Backlog
            </label>
            <Field label="Account label (optional)">
              <Input
                value={account}
                placeholder="For example, Steam Main"
                onChange={(_, d) => setAccount(d.value)}
              />
            </Field>
          </div>
          <div className="steam-tools">
            <Input
              aria-label="Filter games"
              placeholder="Filter by title"
              value={query}
              onChange={(_, d) => setQuery(d.value)}
            />
            <Button
              onClick={() =>
                setSelected((s) => {
                  const next = new Set(s);
                  shown
                    .filter((i) => !i.duplicate)
                    .forEach((i) => next.add(i.appid));
                  return next;
                })
              }
            >
              Select all shown
            </Button>
            <Button
              onClick={() =>
                setSelected((s) => {
                  const next = new Set(s);
                  shown.forEach((i) => next.delete(i.appid));
                  return next;
                })
              }
            >
              Select none shown
            </Button>
            <span className="muted" role="status">
              {chosen.length} of {items.length} selected
            </span>
          </div>
          <ul className="steam-list" aria-label="Steam games">
            {shown.map((i) => (
              <li key={i.appid} className={i.duplicate ? "is-duplicate" : ""}>
                <label>
                  <input
                    type="checkbox"
                    disabled={i.duplicate}
                    checked={selected.has(i.appid) && !i.duplicate}
                    aria-label={i.title}
                    onChange={(e) =>
                      setSelected((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(i.appid);
                        else next.delete(i.appid);
                        return next;
                      })
                    }
                  />
                  <span className="steam-title">{i.title}</span>
                </label>
                <span className="steam-meta">
                  {[i.year, i.genre, playtime(i.playtime_minutes)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span
                  className={`steam-tag ${i.duplicate ? "tag-have" : i.matched ? "tag-match" : "tag-none"}`}
                >
                  {i.duplicate
                    ? "Already in library"
                    : i.matched
                      ? "Matched"
                      : "No IGDB match"}
                </span>
              </li>
            ))}
          </ul>
          {shown.length === 0 && (
            <p className="muted">No games match that filter.</p>
          )}
          <div className="actions steam-go">
            <Button
              appearance="primary"
              disabled={chosen.length === 0}
              onClick={() => void run()}
            >
              {chosen.length ? `Import ${plural(chosen.length)}` : "Import"}
            </Button>
            <Button onClick={() => void load()}>Reload</Button>
          </div>
        </section>
      )}

      {phase === "importing" && (
        <section>
          <p role="status">
            Importing... {done} of {chosen.length} done
          </p>
          <ProgressBar
            thickness="large"
            value={chosen.length ? done / chosen.length : 0}
          />
          <div className="actions steam-go">
            <Button
              onClick={() => {
                stop.current = true;
              }}
            >
              Stop after this group
            </Button>
          </div>
        </section>
      )}

      {phase === "done" && (
        <section>
          <h2>{stopped ? "Import stopped" : "Import finished"}</h2>
          <p role="status">
            Added {plural(summary.added)}
            {summary.skipped
              ? `, skipped ${summary.skipped} already in your library`
              : ""}
            {summary.failed ? `, ${summary.failed} failed` : ""}.
            {summary.withoutCover
              ? ` ${plural(summary.withoutCover)} added without a cover because it could not be downloaded.`
              : ""}
            {stopped && chosen.length > outcomes.length
              ? ` ${chosen.length - outcomes.length} not imported.`
              : ""}
          </p>
          {problems.length > 0 && (
            <ul className="steam-problems">
              {problems.slice(0, 10).map((o) => (
                <li key={o.appid}>
                  {o.title}: {o.message}
                </li>
              ))}
            </ul>
          )}
          <div className="actions steam-go">
            <Button appearance="primary" onClick={close}>
              Go to Library
            </Button>
            <Button onClick={() => void load()}>Load again</Button>
          </div>
        </section>
      )}
    </div>
  );
}
