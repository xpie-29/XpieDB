import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  Checkbox,
  Field,
  Input,
  Select,
} from "@fluentui/react-components";
import { duplicates } from "../igdbWorkflow";
import {
  Save20Regular,
  Dismiss20Regular,
  ImageAdd20Regular,
  Delete20Regular,
} from "@fluentui/react-icons";
import type { Game, GameInput, Platform } from "../types";
import { statuses, emptyGame } from "../types";
import { ManagedImage } from "./Shared";
import { NotesEditor } from "./Notes";
import { StarRating } from "./StarRating";
export function GameForm({
  game,
  platforms,
  saved,
  cancel,
  initial,
  warning,
  games = [],
}: {
  game?: Game;
  initial?: GameInput;
  warning?: string | null;
  games?: Game[];
  platforms: Platform[];
  saved: (game: Game) => void;
  cancel: () => void;
}) {
  const [draft, setDraft] = useState<GameInput>(() =>
    game
      ? { ...game, tags: [...game.tags] }
      : initial
        ? { ...initial, tags: [...initial.tags] }
        : emptyGame(platforms[0]?.id ?? 0),
  );
  const [tags, setTags] = useState(draft.tags.join(", "));
  const [imports, setImports] = useState<string[]>(
    initial?.cover_path ? [initial.cover_path] : [],
  );
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const candidates = game ? [] : duplicates(draft, games);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = <K extends keyof GameInput>(key: K, value: GameInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const cleanup = async () => {
    for (const path of imports) await invoke("discard_image", { path });
  };
  const pick = async () => {
    setBusy(true);
    setError("");
    try {
      const path = await invoke<string | null>("select_image", {
        kind: "covers",
      });
      if (path) {
        setImports((v) => [...v, path]);
        change("cover_path", path);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (candidates.length && !allowDuplicate) return;
        setBusy(true);
        setError("");
        try {
          const result = await invoke<Game>("save_game", {
            id: game?.id ?? null,
            input: {
              ...draft,
              tags: tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            },
          });
          try {
            await cleanup();
          } catch (e) {
            console.warn("Unused image cleanup:", e);
          }
          saved(result);
        } catch (e) {
          setError(String(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <header className="page-header">
        <h1>{game ? "Edit Game" : "Add Game"}</h1>
        <div className="actions">
          <Button
            type="button"
            disabled={busy}
            icon={<Dismiss20Regular />}
            onClick={async () => {
              setBusy(true);
              try {
                await cleanup();
                cancel();
              } catch (e) {
                setError(String(e));
                setBusy(false);
              }
            }}
          >
            Cancel
          </Button>
          <Button
            appearance="primary"
            type="submit"
            disabled={busy || (candidates.length > 0 && !allowDuplicate)}
            icon={<Save20Regular />}
          >
            Save
          </Button>
        </div>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {warning && <p role="status">{warning}</p>}
      {candidates.length > 0 && (
        <section className="duplicate-warning">
          <h2>This game may already exist in your Library.</h2>
          <ul>
            {candidates.map((g) => (
              <li key={g.id}>
                {g.title} ·{" "}
                {platforms.find((p) => p.id === g.platform_id)?.name} ·{" "}
                {g.account || "No Account"} · {g.media_type}
                {g.igdb_id === draft.igdb_id ? " · Same IGDB ID" : ""}
              </li>
            ))}
          </ul>
          <Checkbox
            checked={allowDuplicate}
            onChange={(_, d) => setAllowDuplicate(d.checked === true)}
            label="Save another copy"
          />
        </section>
      )}
      <fieldset disabled={busy} inert={busy} className="form-layout">
        <div className="cover-column">
          <ManagedImage
            path={draft.cover_path}
            alt="Game cover"
            className="cover"
          />
          <Button type="button" icon={<ImageAdd20Regular />} onClick={pick}>
            Choose cover
          </Button>
          {draft.cover_path && (
            <Button
              type="button"
              icon={<Delete20Regular />}
              onClick={() => change("cover_path", null)}
            >
              Remove cover
            </Button>
          )}
        </div>
        <div className="form-fields">
          <Field label="Title" required className="span-two">
            <Input
              required
              maxLength={300}
              value={draft.title}
              onChange={(_, d) => change("title", d.value)}
              autoFocus
            />
          </Field>
          <Field label="Platform" required>
            <Select
              value={draft.platform_id}
              onChange={(_, d) => change("platform_id", Number(d.value))}
            >
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Account">
            <Input
              maxLength={500}
              value={draft.account ?? ""}
              onChange={(_, d) => change("account", d.value || null)}
            />
          </Field>
          <Field label="Release date">
            <Input
              type="date"
              value={draft.release_date ?? ""}
              onChange={(_, d) => change("release_date", d.value || null)}
            />
          </Field>
          {(["genre", "developer", "publisher"] as const).map((key) => (
            <Field key={key} label={key[0].toUpperCase() + key.slice(1)}>
              <Input
                maxLength={500}
                value={draft[key] ?? ""}
                onChange={(_, d) => change(key, d.value || null)}
              />
            </Field>
          ))}
          <Field label="Media type">
            <Select
              value={draft.media_type}
              onChange={(_, d) => change("media_type", d.value)}
            >
              <option>Physical</option>
              <option>Digital</option>
            </Select>
          </Field>
          <Field label="Play status">
            <Select
              value={draft.play_status}
              onChange={(_, d) => change("play_status", d.value)}
            >
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Personal rating">
            <StarRating
              value={draft.rating}
              onChange={(value) => change("rating", value)}
            />
          </Field>
          <Field label="Tags (comma separated)" className="span-two">
            <Input value={tags} onChange={(_, d) => setTags(d.value)} />
          </Field>
          <section className="span-two">
            <h2>Notes</h2>
            <NotesEditor
              value={draft.notes_html}
              change={(html) => change("notes_html", html)}
            />
          </section>
        </div>
      </fieldset>
    </form>
  );
}
