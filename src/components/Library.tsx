import { useState } from "react";
import { Button, Select } from "@fluentui/react-components";
import {
  Add20Regular,
  Grid20Regular,
  List20Regular,
  Note20Regular,
} from "@fluentui/react-icons";
import type { Game, Platform, Preferences } from "../types";
import { ManagedImage, PlatformIcon } from "./Shared";
import { meaningfulNotes } from "../notes";
export function Library({
  games,
  platforms,
  preferences,
  preference,
  open,
  add,
}: {
  games: Game[];
  platforms: Platform[];
  preferences: Preferences;
  preference: (key: string, value: string) => void;
  open: (id: number) => void;
  add: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Library</h1>
          <span className="muted">
            {games.length} {games.length === 1 ? "game" : "games"}
          </span>
        </div>
        <Button appearance="primary" icon={<Add20Regular />} onClick={add}>
          Add Game
        </Button>
      </header>
      <div className="library-toolbar">
        <div className="view-toggle" role="group" aria-label="Library view">
          <Button
            aria-label="Cover Grid"
            title="Cover Grid"
            aria-pressed={preferences.library_view === "grid"}
            appearance={
              preferences.library_view === "grid" ? "primary" : "subtle"
            }
            icon={<Grid20Regular />}
            onClick={() => preference("library_view", "grid")}
          />
          <Button
            aria-label="Compact List"
            title="Compact List"
            aria-pressed={preferences.library_view === "list"}
            appearance={
              preferences.library_view === "list" ? "primary" : "subtle"
            }
            icon={<List20Regular />}
            onClick={() => preference("library_view", "list")}
          />
        </div>
        {preferences.library_view === "grid" && (
          <Select
            aria-label="Cover size"
            value={preferences.cover_size}
            onChange={(_, d) => preference("cover_size", d.value)}
          >
            <option value="small">Small covers</option>
            <option value="medium">Medium covers</option>
            <option value="large">Large covers</option>
            <option value="extra_large">Extra Large covers</option>
          </Select>
        )}
      </div>
      {!games.length ? (
        <div className="empty">
          <h2>No games yet</h2>
          <Button icon={<Add20Regular />} onClick={add}>
            Add Game
          </Button>
        </div>
      ) : preferences.library_view === "grid" ? (
        <div className={`cover-grid size-${preferences.cover_size}`}>
          {games.map((g) => (
            <button className="game-card" key={g.id} onClick={() => open(g.id)}>
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
        <div className="list-scroll">
          <div className="game-list" role="grid" aria-label="Game library">
            <div className="list-row list-heading" role="row">
              <span role="columnheader">Platform</span>
              <span role="columnheader">Title</span>
              <span role="columnheader">Genre</span>
              <span role="columnheader">Media</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Rating</span>
              <span role="columnheader">Notes</span>
            </div>
            {games.map((g, i) => (
              <div
                className={`list-row ${selected === g.id ? "selected" : ""}`}
                role="row"
                aria-selected={selected === g.id}
                tabIndex={0}
                key={g.id}
                onClick={() => setSelected(g.id)}
                onDoubleClick={() => open(g.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") open(g.id);
                  if (e.key === " ") {
                    e.preventDefault();
                    setSelected(g.id);
                  }
                  if (["ArrowDown", "ArrowUp"].includes(e.key)) {
                    e.preventDefault();
                    const next =
                      games[
                        Math.max(
                          0,
                          Math.min(
                            games.length - 1,
                            i + (e.key === "ArrowDown" ? 1 : -1),
                          ),
                        )
                      ];
                    setSelected(next.id);
                    const sibling =
                      e.key === "ArrowDown"
                        ? e.currentTarget.nextElementSibling
                        : e.currentTarget.previousElementSibling;
                    if (sibling && !sibling.classList.contains("list-heading"))
                      (sibling as HTMLElement).focus();
                  }
                }}
              >
                <span role="gridcell">
                  <PlatformIcon
                    platform={platforms.find((p) => p.id === g.platform_id)}
                  />
                </span>
                <span role="gridcell">
                  <button className="title-link" onClick={() => open(g.id)}>
                    {g.title}
                  </button>
                </span>
                <span role="gridcell" title={g.genre ?? ""}>
                  {g.genre ?? "-"}
                </span>
                <span role="gridcell">{g.media_type}</span>
                <span role="gridcell">{g.play_status}</span>
                <span
                  role="gridcell"
                  aria-label={
                    g.rating ? `${g.rating} out of 5 stars` : "Unrated"
                  }
                >
                  {g.rating ? `${g.rating} / 5` : "-"}
                </span>
                <span role="gridcell">
                  {meaningfulNotes(g.notes_html) && (
                    <Note20Regular aria-label="Has notes" title="Has notes" />
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
