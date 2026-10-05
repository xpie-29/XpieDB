import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  Checkbox,
  Combobox,
  Field,
  Input,
  Option,
  Select,
} from "@fluentui/react-components";
import {
  Save20Regular,
  Dismiss20Regular,
  ImageAdd20Regular,
  Delete20Regular,
} from "@fluentui/react-icons";
import type { Game, Guide, GuideInput, Platform } from "../types";
import { emptyGuide, hardwareConditions } from "../types";
import { parsePrice } from "../hardwareQuery";
import { ManagedImage } from "./Shared";
import { NotesEditor } from "./Notes";

const priceText = (cents: number | null) =>
  cents === null ? "" : (cents / 100).toFixed(2);
const MAX_OPTIONS = 60;

export function GuideForm({
  guide,
  initial,
  games,
  platforms,
  saved,
  cancel,
}: {
  guide?: Guide;
  /** Starting values for a new guide, e.g. one already linked to a game. */
  initial?: GuideInput;
  games: Game[];
  platforms: Platform[];
  saved: (guide: Guide) => void;
  cancel: () => void;
}) {
  const [draft, setDraft] = useState<GuideInput>(() =>
    guide ? { ...guide } : (initial ?? emptyGuide()),
  );
  const linked = games.find((g) => g.id === draft.game_id);
  const [query, setQuery] = useState(linked?.title ?? "");
  const [price, setPrice] = useState(priceText(draft.purchase_price_cents));
  const [pages, setPages] = useState(
    draft.page_count === null ? "" : String(draft.page_count),
  );
  const [imports, setImports] = useState<string[]>(
    initial?.photo_path ? [initial.photo_path] : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = <K extends keyof GuideInput>(key: K, value: GuideInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const platformName = (game: Game) =>
    platforms.find((p) => p.id === game.platform_id)?.short_name ?? "";
  // Matching games for the box; the first few only, so the list stays usable with a big Library.
  const options = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return games
      .filter((g) => words.every((w) => g.title.toLowerCase().includes(w)))
      .slice(0, MAX_OPTIONS);
  }, [games, query]);
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
        change("photo_path", path);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const text = (key: keyof GuideInput, label: string, span = false) => (
    <Field label={label} className={span ? "span-two" : undefined}>
      <Input
        maxLength={500}
        value={(draft[key] as string | null) ?? ""}
        onChange={(_, d) => change(key, (d.value || null) as never)}
      />
    </Field>
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const cents = parsePrice(price);
        const count = pages.trim() === "" ? null : Number(pages);
        if (cents === undefined) {
          setError("Enter a price like 19.99.");
          return;
        }
        if (count !== null && !(Number.isInteger(count) && count > 0)) {
          setError("Enter the page count as a whole number.");
          return;
        }
        setBusy(true);
        setError("");
        try {
          const result = await invoke<Guide>("save_guide", {
            id: guide?.id ?? null,
            input: { ...draft, purchase_price_cents: cents, page_count: count },
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
        <h1>{guide ? "Edit Guide" : "Add Guide"}</h1>
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
            disabled={busy}
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
      <fieldset disabled={busy} inert={busy} className="form-layout">
        <div className="cover-column">
          <ManagedImage
            path={draft.photo_path}
            alt="Photo"
            className="cover"
          />
          <Button type="button" icon={<ImageAdd20Regular />} onClick={pick}>
            Choose photo
          </Button>
          {draft.photo_path && (
            <Button
              type="button"
              icon={<Delete20Regular />}
              onClick={() => change("photo_path", null)}
            >
              Remove photo
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
          <Field label="Game (from your Library)">
            <Combobox
              placeholder="Search your Library"
              clearable
              value={query}
              selectedOptions={draft.game_id === null ? [] : [String(draft.game_id)]}
              onChange={(e) => {
                setQuery(e.target.value);
                // Typing something else unlinks the previously chosen game.
                if (draft.game_id !== null && e.target.value !== linked?.title)
                  change("game_id", null);
              }}
              onOptionSelect={(_, d) => {
                const game = games.find((g) => String(g.id) === d.optionValue);
                if (!game) {
                  change("game_id", null);
                  setQuery("");
                  return;
                }
                setQuery(game.title);
                setDraft((v) => ({
                  ...v,
                  game_id: game.id,
                  game_title: null,
                  platform_id: v.platform_id ?? game.platform_id,
                }));
              }}
            >
              {options.map((g) => (
                <Option key={g.id} value={String(g.id)} text={g.title}>
                  {g.title}
                  {platformName(g) ? ` · ${platformName(g)}` : ""}
                </Option>
              ))}
            </Combobox>
          </Field>
          {draft.game_id === null ? (
            <Field label="Or the game's name (if not in your Library)">
              <Input
                maxLength={500}
                value={draft.game_title ?? ""}
                onChange={(_, d) => change("game_title", d.value || null)}
              />
            </Field>
          ) : (
            <div />
          )}
          <Field label="Platform">
            <Select
              value={draft.platform_id ?? ""}
              onChange={(_, d) =>
                change("platform_id", d.value ? Number(d.value) : null)
              }
            >
              <option value="">Not specified</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {text("author", "Author")}
          {text("publisher", "Publisher")}
          {text("edition", "Edition")}
          {text("isbn", "ISBN")}
          {text("language", "Language")}
          <Field label="Pages">
            <Input
              inputMode="numeric"
              value={pages}
              onChange={(_, d) => setPages(d.value)}
            />
          </Field>
          <div className="span-two checks">
            <Checkbox
              label="I own a physical copy"
              checked={draft.has_physical}
              onChange={(_, d) => change("has_physical", d.checked === true)}
            />
          </div>
          <Field label="Condition">
            <Select
              value={draft.condition ?? ""}
              onChange={(_, d) => change("condition", d.value || null)}
            >
              <option value="">Not specified</option>
              {hardwareConditions.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Purchase date">
            <Input
              type="date"
              value={draft.purchase_date ?? ""}
              onChange={(_, d) => change("purchase_date", d.value || null)}
            />
          </Field>
          <Field label="Price paid">
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={price}
              onChange={(_, d) => setPrice(d.value)}
            />
          </Field>
          {text("purchase_source", "Bought from")}
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
