import { useEffect, useRef } from "react";
import { Button } from "@fluentui/react-components";
import { Edit20Regular, Delete20Regular } from "@fluentui/react-icons";
import type { Game, Platform } from "../types";
import { ManagedImage, PlatformIcon } from "./Shared";
import { meaningfulNotes } from "../notes";
import { NotesView } from "./NotesView";
import { StarRating } from "./StarRating";
export function GameDetail({
  game,
  platform,
  edit,
  remove,
  error,
}: {
  game: Game;
  platform?: Platform;
  edit: () => void;
  remove: () => void;
  error: (e: string) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [game.id]);
  return (
    <aside
      ref={panel}
      className="detail-sidebar"
      aria-label="Selected game details"
      tabIndex={0}
    >
      <div className="detail-actions">
        <Button icon={<Edit20Regular />} onClick={edit}>
          Edit
        </Button>
        <Button
          title="Delete game"
          aria-label="Delete game"
          icon={<Delete20Regular />}
          appearance="subtle"
          onClick={remove}
        />
      </div>
      <ManagedImage
        path={game.cover_path}
        alt={`${game.title} cover`}
        className="cover inspector-cover"
      />
      <h2 className="game-title">{game.title}</h2>
      <dl className="metadata">
        <div>
          <dt>Platform</dt>
          <dd className="platform-line">
            <PlatformIcon platform={platform} />
            <span>{platform?.name ?? "-"}</span>
          </dd>
        </div>
        {[
          ["Account", game.account],
          ["Release date", game.release_date],
          ["Genre", game.genre],
          ["Developer", game.developer],
          ["Publisher", game.publisher],
          ["Media type", game.media_type],
          ["Play status", game.play_status],
        ].map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value || "-"}</dd>
          </div>
        ))}
        <div>
          <dt>Personal rating</dt>
          <dd>
            <StarRating value={game.rating} />
          </dd>
        </div>
      </dl>
      <section>
        <h3>Tags</h3>
        {game.tags.length ? (
          <div className="tags">
            {game.tags.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        ) : (
          <p className="muted">No tags</p>
        )}
      </section>
      <section className="detail-notes">
        <h3>Notes</h3>
        {meaningfulNotes(game.notes_html) ? (
          <NotesView html={game.notes_html} onError={error} />
        ) : (
          <p className="muted">No notes</p>
        )}
      </section>
      <p className="muted timestamps">
        Added {new Date(game.date_added).toLocaleDateString()} · Modified{" "}
        {new Date(game.date_modified).toLocaleDateString()}
      </p>
    </aside>
  );
}
