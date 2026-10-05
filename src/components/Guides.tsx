import { useEffect, useRef, type KeyboardEvent } from "react";
import { Button, Input, Select } from "@fluentui/react-components";
import {
  Add20Regular,
  Delete20Regular,
  Dismiss16Regular,
  Document20Regular,
  Edit20Regular,
  Folder20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import type { Game, Guide, GuideFile, Platform } from "../types";
import { formatPrice } from "../hardwareQuery";
import {
  copyLabel,
  fileLabel,
  guideFiltersActive,
  guideGameName,
  type GuideFilters,
} from "../guidesQuery";
import { meaningfulNotes } from "../notes";
import { ManagedImage, PlatformIcon } from "./Shared";
import { NotesView } from "./NotesView";

export function GuidesLibrary({
  guides,
  all,
  games,
  platforms,
  filters,
  setFilters,
  selected,
  select,
  add,
  edit,
  remove,
  openGame,
  attachFile,
  openFile,
  revealFile,
  removeFile,
  findOnline,
  error,
  scroll,
  highlight,
}: {
  /** The guides matching the filters, in order. */
  guides: Guide[];
  all: Guide[];
  games: Game[];
  platforms: Platform[];
  filters: GuideFilters;
  setFilters: (filters: GuideFilters) => void;
  selected: number | null;
  select: (id: number) => void;
  add: () => void;
  edit: (guide: Guide) => void;
  remove: (guide: Guide) => void;
  /** Jump to a game in the Games collection. */
  openGame: (id: number) => void;
  /** Digital copies: attach one (the app asks for the file), open it, show it, or remove it. */
  attachFile: (guide: Guide) => void;
  openFile: (file: GuideFile) => void;
  revealFile: (file: GuideFile) => void;
  removeFile: (file: GuideFile) => void;
  /** Look for a digital copy on the Internet Archive. */
  findOnline: (guide: Guide) => void;
  error: (message: string) => void;
  scroll: { current: number };
  highlight: number | null;
}) {
  const pane = useRef<HTMLElement>(null);
  const entries = useRef<Record<number, HTMLElement | null>>({});
  useEffect(() => {
    if (pane.current) pane.current.scrollTop = scroll.current;
    // Restore once, when the list is shown again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const filtered = guideFiltersActive(filters);
  const clear = () => setFilters({ search: "", platform: "", link: "" });
  const current = all.find((g) => g.id === selected) ?? null;
  const usedPlatforms = platforms.filter((p) =>
    all.some((g) => g.platform_id === p.id),
  );
  const keyboard = (e: KeyboardEvent, index: number) => {
    let next = index;
    switch (e.key) {
      case "ArrowDown":
        next++;
        break;
      case "ArrowUp":
        next--;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = guides.length - 1;
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        select(guides[index].id);
        return;
      default:
        return;
    }
    e.preventDefault();
    next = Math.max(0, Math.min(guides.length - 1, next));
    select(guides[next].id);
    entries.current[guides[next].id]?.focus();
  };
  return (
    <div className="library-view guides-view">
      <div className="library-utility">
        <div
          className="library-controls"
          role="search"
          aria-label="Guide search and filters"
        >
          <Input
            className="library-search"
            aria-label="Search guides"
            placeholder="Search guides"
            contentBefore={<Search20Regular />}
            value={filters.search}
            onChange={(_, d) => setFilters({ ...filters, search: d.value })}
          />
          <Select
            aria-label="Platform"
            value={filters.platform}
            onChange={(_, d) => setFilters({ ...filters, platform: d.value })}
          >
            <option value="">All platforms</option>
            {usedPlatforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Game link"
            value={filters.link}
            onChange={(_, d) => setFilters({ ...filters, link: d.value })}
          >
            <option value="">All guides</option>
            <option value="linked">Linked to a game</option>
            <option value="unlinked">Not linked</option>
          </Select>
          <Button
            appearance="subtle"
            disabled={!filtered}
            icon={<Dismiss16Regular />}
            onClick={clear}
          >
            Clear
          </Button>
        </div>
      </div>
      <div className="library-workspace">
        <section
          className="library-pane"
          aria-label="Guides content"
          tabIndex={-1}
          ref={pane}
          onScroll={(e) => {
            scroll.current = e.currentTarget.scrollTop;
          }}
        >
          <div className="library-summary">
            <h1>Guides</h1>
            <span className="muted" role="status">
              {filtered
                ? `${guides.length} of ${all.length} guides`
                : `${all.length} ${all.length === 1 ? "guide" : "guides"}`}
            </span>
          </div>
          {!guides.length ? (
            <div className="empty">
              <h2>
                {all.length
                  ? "No guides match the current search and filters."
                  : "No guides yet"}
              </h2>
              <Button
                icon={all.length ? undefined : <Add20Regular />}
                onClick={all.length ? clear : add}
              >
                {all.length ? "Clear All Filters" : "Add Guide"}
              </Button>
            </div>
          ) : (
            <div
              className="game-list guide-list"
              role="grid"
              aria-label="Guides"
            >
              <div className="gd-row gd-heading" role="row">
                <span role="columnheader">Platform</span>
                <span role="columnheader">Title</span>
                <span role="columnheader">Game</span>
                <span role="columnheader">Copy</span>
                <span role="columnheader">Condition</span>
                <span role="columnheader">Paid</span>
              </div>
              {guides.map((g, i) => (
                <div
                  key={g.id}
                  ref={(el) => {
                    entries.current[g.id] = el;
                  }}
                  className={`gd-row ${selected === g.id ? "selected" : ""} ${highlight === g.id ? "just-edited" : ""}`}
                  role="row"
                  aria-selected={selected === g.id}
                  tabIndex={selected === g.id ? 0 : -1}
                  onClick={() => select(g.id)}
                  onKeyDown={(e) => keyboard(e, i)}
                >
                  <span role="gridcell">
                    {g.platform_id === null ? (
                      <span className="muted" title="No platform">
                        -
                      </span>
                    ) : (
                      <PlatformIcon
                        platform={platforms.find((p) => p.id === g.platform_id)}
                      />
                    )}
                  </span>
                  <span role="gridcell" title={g.title}>
                    {g.title}
                  </span>
                  <span
                    role="gridcell"
                    title={guideGameName(g, games) ?? ""}
                    className={g.game_id === null ? "muted" : undefined}
                  >
                    {guideGameName(g, games) ?? "-"}
                  </span>
                  <span role="gridcell">{copyLabel(g)}</span>
                  <span role="gridcell">{g.condition ?? "-"}</span>
                  <span role="gridcell">
                    {formatPrice(g.purchase_price_cents)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
        {current && (
          <GuideDetail
            guide={current}
            games={games}
            platforms={platforms}
            edit={() => edit(current)}
            remove={() => remove(current)}
            openGame={openGame}
            attachFile={() => attachFile(current)}
            openFile={openFile}
            revealFile={revealFile}
            removeFile={removeFile}
            findOnline={() => findOnline(current)}
            error={error}
          />
        )}
      </div>
    </div>
  );
}

function GuideDetail({
  guide,
  games,
  platforms,
  edit,
  remove,
  openGame,
  attachFile,
  openFile,
  revealFile,
  removeFile,
  findOnline,
  error,
}: {
  guide: Guide;
  games: Game[];
  platforms: Platform[];
  edit: () => void;
  remove: () => void;
  openGame: (id: number) => void;
  attachFile: () => void;
  openFile: (file: GuideFile) => void;
  revealFile: (file: GuideFile) => void;
  removeFile: (file: GuideFile) => void;
  findOnline: () => void;
  error: (message: string) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [guide.id]);
  const platform = platforms.find((p) => p.id === guide.platform_id);
  const gameName = guideGameName(guide, games);
  const fields: Array<[string, string | null]> = [
    ["Author", guide.author],
    ["Publisher", guide.publisher],
    ["Edition", guide.edition],
    ["ISBN", guide.isbn],
    ["Language", guide.language],
    ["Pages", guide.page_count === null ? null : String(guide.page_count)],
    ["Physical copy", guide.has_physical ? "Yes" : "No"],
    ["Condition", guide.condition],
    ["Purchase date", guide.purchase_date],
    ["Price paid", formatPrice(guide.purchase_price_cents)],
    ["Bought from", guide.purchase_source],
  ];
  return (
    <aside
      ref={panel}
      className="detail-sidebar"
      aria-label="Selected guide details"
      tabIndex={0}
    >
      <div className="detail-actions">
        <Button icon={<Edit20Regular />} onClick={edit}>
          Edit
        </Button>
        <Button
          title="Delete guide"
          aria-label="Delete guide"
          icon={<Delete20Regular />}
          appearance="subtle"
          onClick={remove}
        />
      </div>
      <ManagedImage
        path={guide.photo_path}
        alt={`${guide.title} photo`}
        className="cover inspector-cover"
      />
      <h2 className="game-title">{guide.title}</h2>
      <dl className="metadata">
        <div>
          <dt>Game</dt>
          <dd>
            {guide.game_id !== null && gameName ? (
              <Button
                appearance="transparent"
                size="small"
                onClick={() => openGame(guide.game_id as number)}
              >
                {gameName}
              </Button>
            ) : (
              (gameName ?? "-")
            )}
          </dd>
        </div>
        <div>
          <dt>Platform</dt>
          <dd className="platform-line">
            {platform ? (
              <>
                <PlatformIcon platform={platform} />
                <span>{platform.name}</span>
              </>
            ) : (
              <span>Not specified</span>
            )}
          </dd>
        </div>
        {fields.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value || "-"}</dd>
          </div>
        ))}
      </dl>
      <section aria-label="Digital copies" className="detail-links">
        <h3>Digital copies ({guide.files.length})</h3>
        {guide.files.length > 0 ? (
          <ul className="file-list">
            {guide.files.map((f) => (
              <li key={f.id}>
                <div className="file-name">
                  <Document20Regular aria-hidden />
                  <span title={f.file_name}>{f.file_name}</span>
                </div>
                <span className="muted">{fileLabel(f)}</span>
                {f.missing ? (
                  <p className="error" role="alert">
                    This file is no longer in the app&apos;s folder (guide
                    files are not part of backups unless you include them).
                    Remove it and attach it again.
                  </p>
                ) : null}
                <div className="file-actions">
                  <Button
                    size="small"
                    disabled={f.missing}
                    onClick={() => openFile(f)}
                  >
                    Open
                  </Button>
                  <Button
                    size="small"
                    icon={<Folder20Regular />}
                    disabled={f.missing}
                    aria-label={`Show ${f.file_name} in folder`}
                    title="Show in folder"
                    onClick={() => revealFile(f)}
                  />
                  <Button
                    size="small"
                    icon={<Delete20Regular />}
                    appearance="subtle"
                    aria-label={`Remove ${f.file_name}`}
                    title="Remove this file"
                    onClick={() => removeFile(f)}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No digital copy</p>
        )}
        <div className="button-stack">
          <Button icon={<Add20Regular />} onClick={attachFile}>
            Attach PDF or ePub
          </Button>
          <Button icon={<Search20Regular />} onClick={findOnline}>
            Find on Internet Archive
          </Button>
        </div>
      </section>
      <section className="detail-notes">
        <h3>Notes</h3>
        {meaningfulNotes(guide.notes_html) ? (
          <NotesView html={guide.notes_html} onError={error} />
        ) : (
          <p className="muted">No notes</p>
        )}
      </section>
      <p className="muted timestamps">
        Added {new Date(guide.date_added).toLocaleDateString()} · Modified{" "}
        {new Date(guide.date_modified).toLocaleDateString()}
      </p>
    </aside>
  );
}
