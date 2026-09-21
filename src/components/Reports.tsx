import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  Checkbox,
  Field,
  Radio,
  RadioGroup,
  Select,
} from "@fluentui/react-components";
import { DocumentPdf20Regular } from "@fluentui/react-icons";
import type { Preferences } from "../types";

type GroupBy = "none" | "platform";
type Column =
  | "platform"
  | "year"
  | "genre"
  | "status"
  | "rating"
  | "account"
  | "media_type";
type ReportResult = {
  path: string;
  games: number;
  pages: number;
  unsupported_characters: number;
};

const presets: Array<{ id: GroupBy; name: string; text: string }> = [
  {
    id: "none",
    name: "All games, alphabetical",
    text: "One list of every game, sorted by title.",
  },
  {
    id: "platform",
    name: "Games by platform",
    text: "Grouped by platform, with each platform's games sorted by title. The PDF gets a bookmark for each platform.",
  },
];
const columns: Array<{ id: Column; name: string }> = [
  { id: "platform", name: "Platform" },
  { id: "year", name: "Release year" },
  { id: "genre", name: "Genre" },
  { id: "status", name: "Play status" },
  { id: "rating", name: "Rating" },
  { id: "account", name: "Account" },
  { id: "media_type", name: "Media type" },
];
const defaultColumns: Column[] = ["platform", "year", "status", "rating"];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// US Letter in North America, A4 everywhere else, until the user chooses.
function defaultPaper() {
  try {
    const region = new Intl.Locale(navigator.language).region;
    return region && ["US", "CA", "MX"].includes(region) ? "letter" : "a4";
  } catch {
    return "a4";
  }
}

export function Reports({
  gameCount,
  preferences,
  preference,
  working,
}: {
  gameCount: number;
  preferences: Preferences;
  preference: (key: string, value: string) => Promise<void> | void;
  working: (busy: boolean) => void;
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>("none"),
    [selected, setSelected] = useState<Column[]>(defaultColumns),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [warning, setWarning] = useState(""),
    [error, setError] = useState("");
  const paper = preferences.report_paper ?? defaultPaper();
  const orientation = preferences.report_orientation ?? "portrait";
  // Platform is implied by the headings when grouping by it.
  const available = columns.filter(
    (c) => !(groupBy === "platform" && c.id === "platform"),
  );
  async function create() {
    setBusy(true);
    working(true);
    setMessage("");
    setWarning("");
    setError("");
    try {
      const result = await invoke<ReportResult | null>("report_create", {
        request: {
          group_by: groupBy,
          paper,
          landscape: orientation === "landscape",
          columns: selected.filter((c) => available.some((a) => a.id === c)),
        },
      });
      if (result) {
        setMessage(
          `Saved ${plural(result.games, "game")} on ${plural(result.pages, "page")} to ${result.path}.`,
        );
        if (result.unsupported_characters > 0)
          setWarning(
            `${plural(result.unsupported_characters, "character")} could not be printed with the report font (for example Japanese or Korean text) and appear as ?.`,
          );
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      working(false);
    }
  }
  return (
    <div className="reports">
      <header className="page-header">
        <h1>Reports</h1>
      </header>
      <p className="muted">
        Create a PDF of your library to read or print away from the computer.
      </p>
      <fieldset>
        <legend>Report</legend>
        <RadioGroup
          value={groupBy}
          onChange={(_, d) => setGroupBy(d.value as GroupBy)}
        >
          {presets.map((p) => (
            <Radio key={p.id} value={p.id} label={p.name} />
          ))}
        </RadioGroup>
        <p className="muted">{presets.find((p) => p.id === groupBy)?.text}</p>
      </fieldset>
      <fieldset>
        <legend>Columns after the title</legend>
        <div className="columns">
          {available.map((c) => (
            <Checkbox
              key={c.id}
              label={c.name}
              checked={selected.includes(c.id)}
              onChange={(_, d) =>
                setSelected((current) =>
                  d.checked
                    ? [...current, c.id]
                    : current.filter((x) => x !== c.id),
                )
              }
            />
          ))}
        </div>
      </fieldset>
      <div className="report-options">
        <Field label="Paper size">
          <Select
            value={paper}
            onChange={(_, d) => void preference("report_paper", d.value)}
          >
            <option value="letter">US Letter</option>
            <option value="a4">A4</option>
          </Select>
        </Field>
        <Field label="Orientation">
          <Select
            value={orientation}
            onChange={(_, d) => void preference("report_orientation", d.value)}
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </Select>
        </Field>
      </div>
      <div className="actions">
        <Button
          appearance="primary"
          icon={<DocumentPdf20Regular />}
          disabled={busy || gameCount === 0}
          onClick={() => void create()}
        >
          Create PDF...
        </Button>
      </div>
      {gameCount === 0 && (
        <p className="muted">Add games to your library to create a report.</p>
      )}
      {busy && <p role="status">Creating PDF...</p>}
      {message && <p role="status">{message}</p>}
      {warning && <p role="status">{warning}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
