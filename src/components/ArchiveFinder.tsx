import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Button,
  Field,
  Input,
  ProgressBar,
  Radio,
  RadioGroup,
  Select,
  Spinner,
} from "@fluentui/react-components";
import { Open16Regular, Search20Regular } from "@fluentui/react-icons";
import type { Game, Guide, GuideInput } from "../types";
import { emptyGuide } from "../types";
import { formatBytes } from "../guidesQuery";
import { Modal } from "./Shared";

type Hit = {
  identifier: string;
  title: string;
  creator: string | null;
  year: string | null;
  has_pdf: boolean;
  has_epub: boolean;
  borrow_only: boolean;
  downloads: number;
  score: number;
};
type Found = { hits: Hit[]; broadened: boolean };
type FileChoice = {
  name: string;
  kind: "pdf" | "epub";
  detail: string;
  size_bytes: number;
  too_large: boolean;
};
type Item = {
  identifier: string;
  title: string;
  borrow_only: boolean;
  files: FileChoice[];
};

/** Where a download goes: an existing guide, or (from a game) a new guide for that game. */
export type FinderTarget =
  | { kind: "guide"; guide: Guide }
  | { kind: "game"; game: Game; guides: Guide[] };

export function ArchiveFinder({
  initialQuery,
  target,
  close,
  done,
}: {
  initialQuery: string;
  target: FinderTarget;
  close: () => void;
  done: (guide: Guide) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Hit | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [loadingItem, setLoadingItem] = useState(false);
  const [file, setFile] = useState("");
  // For a game: a new guide (with this title) or one of the game's existing guides.
  const [attachTo, setAttachTo] = useState("new");
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState<{
    received: number;
    total: number | null;
  } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    let stop: (() => void) | undefined;
    listen<{ received: number; total: number | null }>(
      "archive-progress",
      (e) => setProgress(e.payload),
    )
      .then((unlisten) => (live.current ? (stop = unlisten) : unlisten()))
      .catch(() => {});
    return () => {
      live.current = false;
      stop?.();
    };
  }, []);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError("");
    setPicked(null);
    setItem(null);
    try {
      setFound(await invoke<Found>("archive_search", { query }));
    } catch (e) {
      setFound(null);
      setError(String(e));
    } finally {
      setSearching(false);
    }
  };
  const choose = async (hit: Hit) => {
    setPicked(hit);
    setItem(null);
    setError("");
    setTitle(hit.title);
    setLoadingItem(true);
    try {
      const details = await invoke<Item>("archive_item", {
        identifier: hit.identifier,
      });
      setItem(details);
      setFile(details.files.find((f) => !f.too_large)?.name ?? "");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingItem(false);
    }
  };
  const download = async () => {
    if (!picked || !item || !file) return;
    setDownloading(true);
    setProgress(null);
    setError("");
    const newGuide: GuideInput | null =
      target.kind === "game" && attachTo === "new"
        ? {
            ...emptyGuide(),
            title: title.trim() || picked.title,
            game_id: target.game.id,
            platform_id: target.game.platform_id,
            author: picked.creator,
            has_physical: false,
          }
        : null;
    const guideId =
      target.kind === "guide"
        ? target.guide.id
        : attachTo === "new"
          ? null
          : Number(attachTo);
    try {
      const guide = await invoke<Guide>("archive_download", {
        request: {
          identifier: picked.identifier,
          file_name: file,
          guide_id: guideId,
          new_guide: newGuide,
        },
      });
      done(guide);
    } catch (e) {
      setError(String(e));
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  };
  const openPage = (identifier: string) =>
    invoke("archive_open_page", { identifier }).catch((e) =>
      setError(String(e)),
    );
  const percent =
    progress && progress.total
      ? Math.min(1, progress.received / progress.total)
      : undefined;
  const chosen = item?.files.find((f) => f.name === file);
  return (
    <Modal
      title="Find on the Internet Archive"
      wide
      close={() => {
        if (!downloading) close();
      }}
      actions={
        downloading ? (
          <Button onClick={() => void invoke("archive_cancel")}>
            Cancel download
          </Button>
        ) : (
          <Button onClick={close}>Close</Button>
        )
      }
    >
      <form
        className="archive-search"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input
          aria-label="Search the Internet Archive"
          value={query}
          disabled={downloading}
          onChange={(_, d) => setQuery(d.value)}
          maxLength={200}
          autoFocus
        />
        <Button
          type="submit"
          appearance="primary"
          icon={<Search20Regular />}
          disabled={searching || downloading || !query.trim()}
        >
          Search
        </Button>
      </form>
      <p className="muted archive-note">
        Results come from archive.org and are matched by title, so check each
        one before you download. XpieDB lists what the Archive offers; you
        decide what you may keep.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {searching && <Spinner label="Searching the Internet Archive" />}
      {found && !searching && (
        <>
          {found.broadened && found.hits.length > 0 && (
            <p className="muted" role="status">
              Nothing matched those words in a title, so this searches all of
              each item&apos;s text.
            </p>
          )}
          {!found.hits.length ? (
            <p role="status">
              No matches. Try fewer words, or the guide&apos;s own title.
            </p>
          ) : (
            <ul className="archive-results" aria-label="Matches">
              {found.hits.map((hit) => (
                <li key={hit.identifier}>
                  <button
                    type="button"
                    className={`archive-hit ${picked?.identifier === hit.identifier ? "selected" : ""}`}
                    aria-pressed={picked?.identifier === hit.identifier}
                    disabled={downloading}
                    onClick={() => void choose(hit)}
                  >
                    <strong>{hit.title}</strong>
                    <span className="muted">
                      {[hit.creator, hit.year].filter(Boolean).join(" · ") ||
                        hit.identifier}
                    </span>
                    <span className="archive-badges">
                      {hit.borrow_only && (
                        <span className="badge warn">Borrow only</span>
                      )}
                      {hit.has_pdf && <span className="badge">PDF</span>}
                      {hit.has_epub && <span className="badge">ePub</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {picked && (
        <section className="archive-detail" aria-label="Selected match">
          <h3>{picked.title}</h3>
          {loadingItem && <Spinner label="Checking the files" />}
          {item && item.borrow_only && (
            <p role="status">
              This item is borrow-only on archive.org (lending library), so
              XpieDB cannot download it.
            </p>
          )}
          {item && !item.borrow_only && !item.files.length && (
            <p role="status">
              This item has no PDF or ePub file that can be downloaded.
            </p>
          )}
          {item && !item.borrow_only && item.files.length > 0 && (
            <>
              <RadioGroup
                aria-label="File to download"
                value={file}
                onChange={(_, d) => setFile(d.value)}
                disabled={downloading}
              >
                {item.files.map((f, i) => (
                  <Radio
                    key={f.name}
                    value={f.name}
                    disabled={f.too_large}
                    label={`${f.name} · ${f.kind === "pdf" ? "PDF" : "ePub"}${f.detail ? ` · ${f.detail}` : ""} · ${f.size_bytes ? formatBytes(f.size_bytes) : "size unknown"}${f.too_large ? " · too large" : i === 0 ? " · recommended" : ""}`}
                  />
                ))}
              </RadioGroup>
              {target.kind === "game" && (
                <div className="archive-target">
                  <Field label="Attach to">
                    <Select
                      value={attachTo}
                      disabled={downloading}
                      onChange={(_, d) => setAttachTo(d.value)}
                    >
                      <option value="new">A new guide</option>
                      {target.guides.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {attachTo === "new" && (
                    <Field label="New guide title">
                      <Input
                        value={title}
                        disabled={downloading}
                        maxLength={300}
                        onChange={(_, d) => setTitle(d.value)}
                      />
                    </Field>
                  )}
                </div>
              )}
              {downloading ? (
                <div role="status" aria-label="Download progress">
                  <ProgressBar value={percent} />
                  <p className="muted">
                    {progress
                      ? `${formatBytes(progress.received)}${progress.total ? ` of ${formatBytes(progress.total)}` : ""}`
                      : "Starting the download"}
                  </p>
                </div>
              ) : (
                <Button
                  appearance="primary"
                  disabled={!file || (attachTo === "new" && target.kind === "game" && !title.trim())}
                  onClick={() => void download()}
                >
                  {`Download${chosen ? ` (${chosen.size_bytes ? formatBytes(chosen.size_bytes) : "size unknown"})` : ""} and attach`}
                </Button>
              )}
            </>
          )}
          <p>
            <Button
              size="small"
              appearance="transparent"
              icon={<Open16Regular />}
              onClick={() => void openPage(picked.identifier)}
            >
              Open on archive.org
            </Button>
          </p>
        </section>
      )}
    </Modal>
  );
}
