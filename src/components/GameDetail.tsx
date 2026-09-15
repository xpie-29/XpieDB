import { Button } from "@fluentui/react-components";
import {
  ArrowLeft20Regular,
  Edit20Regular,
  Delete20Regular,
} from "@fluentui/react-icons";
import type { Game, Platform } from "../types";
import { ManagedImage, PlatformIcon } from "./Shared";
import { meaningfulNotes } from "../notes";
import { NotesView } from "./NotesView";
export function GameDetail({
  game,
  platform,
  back,
  edit,
  remove,
  error,
}: {
  game: Game;
  platform?: Platform;
  back: () => void;
  edit: () => void;
  remove: () => void;
  error: (e: string) => void;
}) {
  return (
    <>
      <header className="page-header">
        <Button icon={<ArrowLeft20Regular />} onClick={back}>
          Library
        </Button>
        <div className="actions">
          <Button icon={<Edit20Regular />} onClick={edit}>
            Edit
          </Button>
          <Button icon={<Delete20Regular />} onClick={remove}>
            Delete
          </Button>
        </div>
      </header>
      <article className="detail-layout">
        <ManagedImage
          path={game.cover_path}
          alt={`${game.title} cover`}
          className="cover"
        />
        <div>
          <h1>{game.title}</h1>
          <div className="platform-line">
            <PlatformIcon platform={platform} />
            <span>{platform?.name}</span>
            <span className="status">{game.play_status}</span>
          </div>
          <dl className="metadata">
            {[
              ["Release date", game.release_date],
              ["Genre", game.genre],
              ["Developer", game.developer],
              ["Publisher", game.publisher],
              ["Media type", game.media_type],
              [
                "Personal rating",
                game.rating ? `${game.rating} / 5 stars` : "Unrated",
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || "-"}</dd>
              </div>
            ))}
          </dl>
          {game.tags.length > 0 && (
            <div className="tags">
              {game.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          )}
          <section className="detail-notes">
            <h2>Notes</h2>
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
        </div>
      </article>
    </>
  );
}
