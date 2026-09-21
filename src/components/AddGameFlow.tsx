import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  Field,
  Input,
  Select,
  Spinner,
} from "@fluentui/react-components";
import {
  Search20Regular,
  Edit20Regular,
  ArrowLeft20Regular,
  ArrowRight20Regular,
  ArrowDownload20Regular,
} from "@fluentui/react-icons";
import type { Game, Platform } from "../types";
import {
  type IgdbResult,
  type IgdbImport,
  searchState,
  platformChoice,
} from "../igdbWorkflow";
import { GameForm } from "./GameForm";
import placeholder from "../placeholder.svg";
function Thumbnail({ id, title }: { id: string | null; title: string }) {
  const [src, setSrc] = useState(placeholder);
  useEffect(() => {
    let active = true;
    setSrc(placeholder);
    if (id)
      void invoke<string>("igdb_thumbnail", { imageId: id })
        .then((v) => {
          if (active) setSrc(v);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);
  return <img className="igdb-thumbnail" src={src} alt={`${title} cover`} />;
}
export function AddGameFlow({
  platforms,
  games,
  saved,
  cancel,
  steam,
}: {
  platforms: Platform[];
  games: Game[];
  saved: (g: Game) => void;
  cancel: () => void;
  steam?: () => void;
}) {
  const [path, setPath] = useState<"choose" | "search" | "manual" | "review">(
    "choose",
  );
  const [query, setQuery] = useState(""),
    [state, setState] = useState(searchState("idle"));
  const [selected, setSelected] = useState<IgdbResult | null>(null),
    [remote, setRemote] = useState<number | null>(null),
    [local, setLocal] = useState<number | null>(null);
  const [imported, setImported] = useState<IgdbImport | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selection = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected) selection.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  async function search() {
    setSelected(null);
    setError("");
    setState(searchState("loading"));
    try {
      setState(
        searchState(
          "ready",
          await invoke<IgdbResult[]>("igdb_search", { query }),
        ),
      );
    } catch (e) {
      setState(searchState("error", [], String(e)));
    }
  }
  if (path === "manual" || path === "review")
    return (
      <GameForm
        platforms={platforms}
        saved={saved}
        cancel={cancel}
        initial={imported?.input}
        warning={imported?.warning}
        games={games}
      />
    );
  const locked = busy || state.status === "loading";
  return (
    <div className="add-workflow">
      <header className="page-header">
        <h1>Add Game</h1>
        <Button
          disabled={locked}
          icon={<ArrowLeft20Regular />}
          onClick={cancel}
        >
          Library
        </Button>
      </header>
      <div className="actions add-paths">
        <Button
          disabled={locked}
          appearance={path === "search" ? "primary" : "secondary"}
          icon={<Search20Regular />}
          onClick={() => setPath("search")}
        >
          Search IGDB
        </Button>
        <Button
          disabled={locked}
          icon={<Edit20Regular />}
          onClick={() => setPath("manual")}
        >
          Enter Manually
        </Button>
        {steam && (
          <Button
            disabled={locked}
            icon={<ArrowDownload20Regular />}
            onClick={steam}
          >
            Import from Steam
          </Button>
        )}
      </div>
      {path === "search" && (
        <>
          <form
            className="igdb-search"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <Input
              aria-label="Search IGDB"
              placeholder="Search IGDB games"
              value={query}
              disabled={locked}
              maxLength={200}
              onChange={(_, d) => setQuery(d.value)}
            />
            <Button
              type="submit"
              disabled={locked || !query.trim()}
              icon={<Search20Regular />}
            >
              Search
            </Button>
          </form>
          {state.status === "loading" && <Spinner label="Searching IGDB" />}
          {state.status === "error" && (
            <p role="alert" className="error">
              {state.error}
            </p>
          )}
          {state.status === "ready" && !state.results.length && (
            <p role="status">No IGDB games found.</p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="igdb-results">
            {state.results.map((result) => (
              <button
                type="button"
                key={result.igdb_id}
                disabled={locked}
                aria-pressed={selected?.igdb_id === result.igdb_id}
                className="igdb-result"
                onClick={() => {
                  setSelected(result);
                  const choice = platformChoice(result);
                  setRemote(choice.remote);
                  setLocal(choice.local);
                  setError("");
                }}
              >
                <Thumbnail id={result.thumbnail} title={result.title} />
                <span>
                  <strong>{result.title}</strong>
                  <span className="muted">
                    {result.release_year ?? "Release date unknown"}
                    {result.version ? " · Version" : ""}
                  </span>
                  <span>
                    {result.platforms.map((p) => p.name).join(", ") ||
                      "Platform unspecified"}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {selected && (
            <section ref={selection} className="igdb-selection">
              <h2>{selected.title}</h2>
              <div className="filter-fields">
                <Field label="IGDB platform">
                  <Select
                    disabled={locked || !selected.platforms.length}
                    value={remote ?? ""}
                    onChange={(_, d) => {
                      const p = selected.platforms.find(
                        (p) => p.id === Number(d.value),
                      );
                      setRemote(p?.id ?? null);
                      setLocal(p?.local_id ?? null);
                    }}
                  >
                    <option value="">
                      {selected.platforms.length
                        ? "Choose a platform"
                        : "Platform unspecified"}
                    </option>
                    {selected.platforms.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="XpieDB platform">
                  <Select
                    disabled={locked}
                    value={local ?? ""}
                    onChange={(_, d) =>
                      setLocal(d.value ? Number(d.value) : null)
                    }
                  >
                    <option value="">Choose an existing platform</option>
                    {platforms.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {(!remote ||
                !selected.platforms.find((p) => p.id === remote)?.local_id) && (
                <p className="muted">
                  No automatic mapping. Choose an existing XpieDB platform.
                </p>
              )}
              <Button
                appearance="primary"
                icon={<ArrowRight20Regular />}
                disabled={
                  locked || !local || (selected.platforms.length > 0 && !remote)
                }
                onClick={() => {
                  setBusy(true);
                  setError("");
                  void invoke<IgdbImport>("igdb_import", {
                    igdbId: selected.igdb_id,
                    remotePlatform: remote,
                    localPlatform: local,
                  })
                    .then((value) => {
                      setImported(value);
                      setPath("review");
                    })
                    .catch((e) => setError(String(e)))
                    .finally(() => setBusy(false));
                }}
              >
                Review import
              </Button>
              {busy && <Spinner label="Preparing metadata and cover" />}
            </section>
          )}
        </>
      )}
    </div>
  );
}
