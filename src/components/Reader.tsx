import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button, Input, Select, Spinner } from "@fluentui/react-components";
import {
  ArrowLeft20Regular,
  Bookmark20Filled,
  Bookmark20Regular,
  ChevronDown20Regular,
  ChevronLeft20Regular,
  ChevronRight20Regular,
  ChevronUp20Regular,
  Delete16Regular,
  Dismiss16Regular,
  FullScreenMaximize20Regular,
  FullScreenMinimize20Regular,
  Library20Regular,
  Open20Regular,
  Search20Regular,
  TextBulletListLtr20Regular,
  WeatherMoon20Regular,
  ZoomIn20Regular,
  ZoomOut20Regular,
} from "@fluentui/react-icons";
import type { Game, Guide, GuideFile } from "../types";
import { guideGameName } from "../guidesQuery";
import {
  failureOf,
  PdfReader,
  type OpenFailure,
  type OutlineNode,
} from "../pdfReader";

type Bookmark = {
  id: number;
  file_id: number;
  page: number;
  label: string;
  date_added: string;
};
type Panel = "contents" | "bookmarks" | "guides" | null;

const failureText: Record<OpenFailure, string> = {
  password:
    "This PDF is password-protected, so it can't be read here. You can still open it in your default reader.",
  invalid: "This file doesn't look like a valid PDF.",
  missing: "The file is no longer in the app's folder.",
  network: "This PDF couldn't be loaded.",
  unknown: "This PDF couldn't be opened.",
};
const zoomChoices: Array<[string, string]> = [
  ["page-width", "Fit width"],
  ["page-fit", "Fit page"],
  ["auto", "Automatic"],
  ["0.5", "50%"],
  ["0.75", "75%"],
  ["1.00", "100%"],
  ["1.25", "125%"],
  ["1.50", "150%"],
  ["2.00", "200%"],
  ["3.00", "300%"],
];

/** Where a file is among all guides, by file id. */
function locate(guides: Guide[], fileId: number) {
  for (const guide of guides) {
    const file = guide.files.find((f) => f.id === fileId);
    if (file) return { guide, file };
  }
  return null;
}

export function Reader({
  guides,
  games,
  startFileId,
  preferences,
  setPreference,
  close,
  onPosition,
  error,
}: {
  guides: Guide[];
  games: Game[];
  startFileId: number;
  preferences: { reader_night?: string; reader_zoom?: string };
  setPreference: (key: string, value: string) => void;
  close: () => void;
  /** The reader stopped at this page of this file. */
  onPosition: (fileId: number, page: number) => void;
  error: (message: string) => void;
}) {
  const [fileId, setFileId] = useState(startFileId);
  const where = locate(guides, fileId);
  const container = useRef<HTMLDivElement>(null);
  const viewerElement = useRef<HTMLDivElement>(null);
  const reader = useRef<PdfReader | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [failure, setFailure] = useState<OpenFailure>("unknown");
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageText, setPageText] = useState("1");
  const [zoom, setZoom] = useState(preferences.reader_zoom ?? "page-width");
  const [panel, setPanel] = useState<Panel>(null);
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState({ current: 0, total: 0 });
  const [found, setFound] = useState(true);
  const [full, setFull] = useState(false);
  const [filter, setFilter] = useState("");
  const night = preferences.reader_night === "true";

  // Where the reader is, kept in refs for the callbacks PDF.js calls back into.
  const current = useRef({ fileId, ready: false });
  current.current = { fileId, ready: status === "ready" };
  const pending = useRef<{ id: number; page: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const userZoom = useRef(false);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const save = pending.current;
    pending.current = null;
    if (!save) return;
    invoke("set_guide_file_position", { id: save.id, page: save.page })
      .then(() => onPosition(save.id, save.page))
      .catch(() => {});
  }, [onPosition]);

  // Create the PDF.js viewer once the screen has its elements.
  useEffect(() => {
    if (!container.current || !viewerElement.current) return;
    const instance = new PdfReader(container.current, viewerElement.current, {
      page: (n) => {
        setPage(n);
        setPageText(String(n));
        if (current.current.ready) {
          pending.current = { id: current.current.fileId, page: n };
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(flush, 800);
        }
      },
      zoom: (z) => {
        setZoom(z);
        if (userZoom.current) {
          userZoom.current = false;
          setPreference("reader_zoom", z);
        }
      },
      matches: (c, t) => setMatches({ current: c, total: t }),
      found: setFound,
    });
    reader.current = instance;
    setReady(true);
    return () => {
      flush();
      reader.current = null;
      setReady(false);
      void instance.close();
    };
    // The callbacks only use refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open the chosen file at the page where it was left.
  const startPage = where?.file.last_page ?? 1;
  const zoomAtOpen = useRef(zoom);
  useEffect(() => {
    const instance = reader.current;
    if (!ready || !instance || !where) return;
    let cancelled = false;
    setStatus("loading");
    setOutline([]);
    setMatches({ current: 0, total: 0 });
    setFound(true);
    setQuery("");
    (async () => {
      try {
        const count = await instance.open(
          convertFileSrc(String(fileId), "guidefile"),
          where.file.size_bytes,
          startPage,
          zoomAtOpen.current,
        );
        if (cancelled) return;
        // A newly opened document starts quietly on its first page, so show where it actually is.
        const first = Math.min(Math.max(1, startPage), count);
        setPages(count);
        setPage(first);
        setPageText(String(first));
        setStatus("ready");
        instance
          .outline()
          .then((o) => !cancelled && setOutline(o))
          .catch(() => {});
      } catch (e) {
        if (cancelled || (e as Error).message === "superseded") return;
        setFailure(failureOf(e));
        setStatus("failed");
      }
    })();
    invoke<Bookmark[]>("list_guide_bookmarks", { fileId })
      .then((list) => !cancelled && setBookmarks(list))
      .catch(() => !cancelled && setBookmarks([]));
    return () => {
      cancelled = true;
      flush();
    };
    // Opening depends on which file, not on its saved page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fileId]);

  // The page area changes size when a side panel opens or closes.
  useEffect(() => {
    if (status === "ready") reader.current?.refit();
  }, [panel, full, status]);
  useEffect(() => {
    const onResize = () => reader.current?.refit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const fullRef = useRef(false);
  useEffect(
    () => () => {
      // Leaving the reader leaves full screen, if the reader put the window there.
      if (fullRef.current)
        void getCurrentWindow()
          .setFullscreen(false)
          .catch(() => {});
    },
    [],
  );

  const toggleFull = async () => {
    try {
      await getCurrentWindow().setFullscreen(!full);
      fullRef.current = !full;
      setFull(!full);
    } catch (e) {
      error(String(e));
    }
  };
  // Typing a page number: Enter jumps (the page box then follows the reader); leaving the box without Enter
  // puts the real page number back.
  const goTo = (value: string) => {
    const n = Number(value);
    if (value.trim() !== "" && Number.isFinite(n)) reader.current?.goToPage(n);
    else setPageText(String(page));
  };
  const chooseZoom = (value: string) => {
    userZoom.current = true;
    reader.current?.setZoom(value);
  };
  const zoomBy = (direction: 1 | -1) => {
    userZoom.current = true;
    if (direction > 0) reader.current?.zoomIn();
    else reader.current?.zoomOut();
  };
  const search = (backwards = false) => reader.current?.find(query, backwards);
  const bookmarked = bookmarks.find((b) => b.page === page);
  const toggleBookmark = async () => {
    try {
      if (bookmarked) {
        await invoke("delete_guide_bookmark", { id: bookmarked.id });
        setBookmarks((list) => list.filter((b) => b.id !== bookmarked.id));
      } else {
        const added = await invoke<Bookmark>("add_guide_bookmark", {
          fileId,
          page,
          label: null,
        });
        setBookmarks((list) =>
          [...list, added].sort((a, b) => a.page - b.page || a.id - b.id),
        );
      }
    } catch (e) {
      error(String(e));
    }
  };
  const renameBookmark = async (b: Bookmark, text: string) => {
    setEditing(null);
    const label = text.trim() || `Page ${b.page}`;
    if (label === b.label) return;
    try {
      await invoke("rename_guide_bookmark", { id: b.id, label });
      setBookmarks((list) =>
        list.map((x) => (x.id === b.id ? { ...x, label } : x)),
      );
    } catch (e) {
      error(String(e));
    }
  };
  const removeBookmark = async (b: Bookmark) => {
    try {
      await invoke("delete_guide_bookmark", { id: b.id });
      setBookmarks((list) => list.filter((x) => x.id !== b.id));
    } catch (e) {
      error(String(e));
    }
  };
  const openExternally = () =>
    invoke("open_guide_file", { id: fileId }).catch((e) => error(String(e)));
  const switchTo = (file: GuideFile) => {
    if (file.id === fileId) return;
    flush();
    zoomAtOpen.current = zoom;
    setFileId(file.id);
  };
  const toggle = (next: Exclude<Panel, null>) =>
    setPanel((p) => (p === next ? null : next));

  // Keyboard: Cmd/Ctrl+F searches, Cmd/Ctrl+B bookmarks, Cmd/Ctrl +/- zoom.
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "f") {
        e.preventDefault();
        document.getElementById("reader-search")?.focus();
      } else if (key === "b") {
        e.preventDefault();
        void toggleBookmark();
      } else if (key === "=" || key === "+") {
        e.preventDefault();
        zoomBy(1);
      } else if (key === "-") {
        e.preventDefault();
        zoomBy(-1);
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  });

  // Guides that can be read here, most recently read first.
  const readable = useMemo(() => {
    const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return guides
      .map((guide) => ({
        guide,
        files: guide.files.filter((f) => f.kind === "pdf" && !f.missing),
      }))
      .filter(({ guide, files }) => {
        if (!files.length) return false;
        const text = `${guide.title} ${guideGameName(guide, games) ?? ""}`.toLowerCase();
        return words.every((w) => text.includes(w));
      })
      .sort((a, b) => {
        const last = (x: { files: GuideFile[] }) =>
          x.files.reduce((m, f) => (f.last_opened_at ?? "") > m ? (f.last_opened_at ?? "") : m, "");
        return (
          last(b).localeCompare(last(a)) ||
          a.guide.title.localeCompare(b.guide.title)
        );
      });
  }, [guides, games, filter]);

  const renderOutline = (nodes: OutlineNode[], depth = 0) => (
    <ul className={`outline depth-${Math.min(depth, 3)}`}>
      {nodes.map((node, i) => (
        <li key={`${depth}-${i}-${node.title}`}>
          <button
            type="button"
            onClick={() => reader.current?.goToOutline(node)}
          >
            {node.title || "Untitled"}
          </button>
          {node.items.length > 0 && renderOutline(node.items, depth + 1)}
        </li>
      ))}
    </ul>
  );
  const title = where?.guide.title ?? "Guide";
  const fileName = where?.file.file_name ?? "";

  return (
    <div
      className={`reader ${night ? "reader-night" : ""}`}
      role="region"
      aria-label="Guide reader"
    >
      <header className="reader-toolbar" role="toolbar" aria-label="Reader controls">
        <Button
          icon={<ArrowLeft20Regular />}
          appearance="subtle"
          onClick={() => {
            flush();
            close();
          }}
        >
          Back
        </Button>
        <div className="reader-title" title={`${title} · ${fileName}`}>
          <strong>{title}</strong>
          <span className="muted">{fileName}</span>
        </div>
        <div className="reader-group" role="group" aria-label="Side panel">
          <Button
            icon={<TextBulletListLtr20Regular />}
            appearance={panel === "contents" ? "primary" : "subtle"}
            aria-pressed={panel === "contents"}
            title="Contents"
            aria-label="Contents"
            onClick={() => toggle("contents")}
          />
          <Button
            icon={<Bookmark20Regular />}
            appearance={panel === "bookmarks" ? "primary" : "subtle"}
            aria-pressed={panel === "bookmarks"}
            title="Bookmarks"
            aria-label="Bookmarks"
            onClick={() => toggle("bookmarks")}
          />
          <Button
            icon={<Library20Regular />}
            appearance={panel === "guides" ? "primary" : "subtle"}
            aria-pressed={panel === "guides"}
            title="Other guides"
            aria-label="Other guides"
            onClick={() => toggle("guides")}
          />
        </div>
        <div className="reader-group" role="group" aria-label="Page">
          <Button
            icon={<ChevronLeft20Regular />}
            appearance="subtle"
            aria-label="Previous page"
            disabled={status !== "ready" || page <= 1}
            onClick={() => reader.current?.goToPage(page - 1)}
          />
          <Input
            className="reader-page"
            aria-label="Page"
            value={pageText}
            disabled={status !== "ready"}
            onChange={(_, d) => setPageText(d.value)}
            onBlur={() => setPageText(String(page))}
            onKeyDown={(e) => {
              if (e.key === "Enter") goTo(pageText);
            }}
          />
          <span className="muted" aria-label="Page count">
            of {pages || "-"}
          </span>
          <Button
            icon={<ChevronRight20Regular />}
            appearance="subtle"
            aria-label="Next page"
            disabled={status !== "ready" || page >= pages}
            onClick={() => reader.current?.goToPage(page + 1)}
          />
        </div>
        <div className="reader-group" role="group" aria-label="Zoom">
          <Button
            icon={<ZoomOut20Regular />}
            appearance="subtle"
            aria-label="Zoom out"
            disabled={status !== "ready"}
            onClick={() => zoomBy(-1)}
          />
          <Select
            aria-label="Zoom level"
            value={zoomChoices.some(([v]) => v === zoom) ? zoom : "custom"}
            disabled={status !== "ready"}
            onChange={(_, d) => chooseZoom(d.value)}
          >
            {!zoomChoices.some(([v]) => v === zoom) && (
              <option value="custom">{Math.round(Number(zoom) * 100)}%</option>
            )}
            {zoomChoices.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Button
            icon={<ZoomIn20Regular />}
            appearance="subtle"
            aria-label="Zoom in"
            disabled={status !== "ready"}
            onClick={() => zoomBy(1)}
          />
        </div>
        <form
          className="reader-group reader-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            search(false);
          }}
        >
          <Input
            id="reader-search"
            aria-label="Search in this guide"
            placeholder="Search"
            contentBefore={<Search20Regular />}
            value={query}
            disabled={status !== "ready"}
            onChange={(_, d) => {
              setQuery(d.value);
              if (!d.value) reader.current?.clearFind();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                reader.current?.clearFind();
              }
            }}
          />
          {query.trim() && (
            <span className="muted" role="status" aria-label="Search result">
              {!found
                ? "Not found"
                : matches.total
                  ? `${matches.current} of ${matches.total}`
                  : ""}
            </span>
          )}
          <Button
            icon={<ChevronUp20Regular />}
            appearance="subtle"
            aria-label="Previous match"
            disabled={!query.trim() || status !== "ready"}
            onClick={() => search(true)}
          />
          <Button
            icon={<ChevronDown20Regular />}
            appearance="subtle"
            aria-label="Next match"
            disabled={!query.trim() || status !== "ready"}
            onClick={() => search(false)}
          />
        </form>
        <div className="reader-group" role="group" aria-label="View">
          <Button
            icon={bookmarked ? <Bookmark20Filled /> : <Bookmark20Regular />}
            appearance="subtle"
            aria-pressed={Boolean(bookmarked)}
            aria-label={bookmarked ? "Remove bookmark from this page" : "Bookmark this page"}
            title={bookmarked ? "Remove bookmark" : "Bookmark this page"}
            disabled={status !== "ready"}
            onClick={() => void toggleBookmark()}
          />
          <Button
            icon={<WeatherMoon20Regular />}
            appearance={night ? "primary" : "subtle"}
            aria-pressed={night}
            aria-label="Night mode"
            title="Night mode (inverts the page colours)"
            onClick={() => setPreference("reader_night", String(!night))}
          />
          <Button
            icon={full ? <FullScreenMinimize20Regular /> : <FullScreenMaximize20Regular />}
            appearance="subtle"
            aria-pressed={full}
            aria-label={full ? "Exit full screen" : "Full screen"}
            title={full ? "Exit full screen" : "Full screen"}
            onClick={() => void toggleFull()}
          />
          <Button
            icon={<Open20Regular />}
            appearance="subtle"
            aria-label="Open in default reader"
            title="Open in your default reader"
            onClick={() => void openExternally()}
          />
        </div>
      </header>
      <div className="reader-body">
        {panel && (
          <aside className="reader-panel" aria-label={panel === "contents" ? "Contents" : panel === "bookmarks" ? "Bookmarks" : "Other guides"}>
            {panel === "contents" &&
              (outline.length ? (
                renderOutline(outline)
              ) : (
                <p className="muted">This guide has no table of contents.</p>
              ))}
            {panel === "bookmarks" && (
              <>
                {bookmarks.length === 0 && (
                  <p className="muted">
                    No bookmarks yet. Use the bookmark button to mark a page.
                  </p>
                )}
                <ul className="bookmark-list">
                  {bookmarks.map((b) => (
                    <li key={b.id} className={b.page === page ? "current" : ""}>
                      {editing?.id === b.id ? (
                        <Input
                          aria-label={`Name for the bookmark on page ${b.page}`}
                          autoFocus
                          value={editing.text}
                          onChange={(_, d) => setEditing({ id: b.id, text: d.value })}
                          onBlur={() => void renameBookmark(b, editing.text)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void renameBookmark(b, editing.text);
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => reader.current?.goToPage(b.page)}
                          onDoubleClick={() => setEditing({ id: b.id, text: b.label })}
                          title="Double-click to rename"
                        >
                          <span>{b.label}</span>
                          <span className="muted">p. {b.page}</span>
                        </button>
                      )}
                      <Button
                        size="small"
                        appearance="subtle"
                        icon={<Delete16Regular />}
                        aria-label={`Delete the bookmark on page ${b.page}`}
                        onClick={() => void removeBookmark(b)}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {panel === "guides" && (
              <>
                <Input
                  aria-label="Find a guide"
                  placeholder="Find a guide"
                  contentBefore={<Search20Regular />}
                  contentAfter={
                    filter ? (
                      <Button
                        size="small"
                        appearance="transparent"
                        icon={<Dismiss16Regular />}
                        aria-label="Clear"
                        onClick={() => setFilter("")}
                      />
                    ) : undefined
                  }
                  value={filter}
                  onChange={(_, d) => setFilter(d.value)}
                />
                {readable.length === 0 && (
                  <p className="muted">No other guides with a PDF.</p>
                )}
                <ul className="guide-switch">
                  {readable.map(({ guide, files }) => (
                    <li key={guide.id}>
                      <strong>{guide.title}</strong>
                      <span className="muted">{guideGameName(guide, games) ?? ""}</span>
                      {files.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className={f.id === fileId ? "current" : ""}
                          aria-current={f.id === fileId ? "true" : undefined}
                          onClick={() => switchTo(f)}
                        >
                          <span>{f.file_name}</span>
                          {f.last_page ? (
                            <span className="muted">page {f.last_page}</span>
                          ) : null}
                        </button>
                      ))}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        )}
        <div className="reader-stage">
          <div className="reader-scroll" ref={container} tabIndex={0} aria-label="Pages">
            <div className="pdfViewer" ref={viewerElement} />
          </div>
          {status === "loading" && (
            <div className="reader-overlay">
              <Spinner label="Opening the guide" />
            </div>
          )}
          {status === "failed" && (
            <div className="reader-overlay reader-error" role="alert">
              <p>{failureText[failure]}</p>
              <Button appearance="primary" onClick={() => void openExternally()}>
                Open in default reader
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
