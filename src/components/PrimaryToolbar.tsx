import { Button, Select } from "@fluentui/react-components";
import {
  Add20Regular,
  DocumentPdf20Regular,
  Grid20Regular,
  List20Regular,
  Settings20Regular,
  TextNumberListLtr20Regular,
  Games20Regular,
} from "@fluentui/react-icons";
import type { Preferences } from "../types";
export type Destination =
  | "library"
  | "backlog"
  | "add"
  | "edit"
  | "steam"
  | "platforms"
  | "reports"
  | "settings";
const destinations = [
  { id: "library", name: "Library", icon: <Grid20Regular /> },
  { id: "backlog", name: "Backlog", icon: <TextNumberListLtr20Regular /> },
  { id: "add", name: "Add Game", icon: <Add20Regular /> },
  { id: "platforms", name: "Platforms", icon: <Games20Regular /> },
  { id: "reports", name: "Reports", icon: <DocumentPdf20Regular /> },
  { id: "settings", name: "Settings", icon: <Settings20Regular /> },
] as const;
export function PrimaryToolbar({
  view,
  navigate,
  locked,
  preferences,
  preference,
}: {
  view: Destination;
  navigate: (view: Destination) => void;
  locked: boolean;
  preferences: Preferences;
  preference: (key: string, value: string) => void;
}) {
  return (
    <header className="primary-toolbar">
      <div className="brand">XpieDB</div>
      <nav aria-label="Primary">
        {destinations.map((d) => (
          <Button
            key={d.id}
            appearance={view === d.id ? "primary" : "subtle"}
            aria-current={view === d.id ? "page" : undefined}
            disabled={locked}
            icon={d.icon}
            onClick={() => navigate(d.id)}
          >
            {d.name}
          </Button>
        ))}
      </nav>
      {view === "library" && (
        <div className="presentation-controls">
          <div className="view-toggle" role="group" aria-label="Library view">
            <Button
              title="Cover Grid"
              aria-label="Cover Grid"
              aria-pressed={preferences.library_view === "grid"}
              appearance={
                preferences.library_view === "grid" ? "primary" : "subtle"
              }
              icon={<Grid20Regular />}
              onClick={() => preference("library_view", "grid")}
            />
            <Button
              title="Compact List"
              aria-label="Compact List"
              aria-pressed={preferences.library_view === "list"}
              appearance={
                preferences.library_view === "list" ? "primary" : "subtle"
              }
              icon={<List20Regular />}
              onClick={() => preference("library_view", "list")}
            />
          </div>
          <Select
            aria-label="Cover size"
            disabled={preferences.library_view !== "grid"}
            value={preferences.cover_size}
            onChange={(_, d) => preference("cover_size", d.value)}
          >
            <option value="small">Small covers</option>
            <option value="medium">Medium covers</option>
            <option value="large">Large covers</option>
            <option value="extra_large">Extra Large covers</option>
          </Select>
        </div>
      )}
    </header>
  );
}
