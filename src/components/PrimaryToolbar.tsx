import type { ReactElement } from "react";
import {
  Button,
  Menu,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Select,
  SplitButton,
} from "@fluentui/react-components";
import {
  Add20Regular,
  DocumentPdf20Regular,
  Grid20Regular,
  List20Regular,
  Settings20Regular,
  TextNumberListLtr20Regular,
  Games20Regular,
  Book20Regular,
  Desktop20Regular,
  ChevronDown16Regular,
} from "@fluentui/react-icons";
import { collectionOf, collections, type Collection, type Preferences } from "../types";
export type Destination =
  | "library"
  | "backlog"
  | "add"
  | "edit"
  | "steam"
  | "platforms"
  | "reports"
  | "settings";
type Item = { id: Destination; name: string; icon: ReactElement };
const item = (id: Destination, name: string, icon: ReactElement): Item => ({
  id,
  name,
  icon,
});
/** Buttons before and after the collection selector, per collection. */
const layout: Record<Collection, { before: Item[]; after: Item[] }> = {
  games: {
    before: [
      item("backlog", "Backlog", <TextNumberListLtr20Regular />),
      item("add", "Add Game", <Add20Regular />),
    ],
    after: [item("reports", "Reports", <DocumentPdf20Regular />)],
  },
  guides: {
    before: [
      item("add", "Add Guide", <Add20Regular />),
    ],
    after: [],
  },
  hardware: {
    before: [
      item("add", "Add Hardware", <Add20Regular />),
    ],
    after: [],
  },
};
const collectionIcon: Record<Collection, ReactElement> = {
  games: <Games20Regular />,
  guides: <Book20Regular />,
  hardware: <Desktop20Regular />,
};
export function PrimaryToolbar({
  view,
  navigate,
  locked,
  preferences,
  preference,
  collection,
  setCollection,
}: {
  view: Destination;
  navigate: (view: Destination) => void;
  locked: boolean;
  preferences: Preferences;
  preference: (key: string, value: string) => void;
  collection: Collection;
  setCollection: (collection: Collection) => void;
}) {
  const name = collections.find((c) => c.id === collection)?.name;
  const button = (d: Item) => (
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
  );
  return (
    <header className="primary-toolbar">
      <div className="brand">XpieDB</div>
      <nav aria-label="Primary">
        <Menu
          positioning="below-start"
          checkedValues={{ collection: [collection] }}
          onCheckedValueChange={(_, d) =>
            setCollection(collectionOf(d.checkedItems[0]))
          }
        >
          <MenuTrigger disableButtonEnhancement>
            {(triggerProps) => (
              <SplitButton
                appearance={view === "library" ? "primary" : "subtle"}
                disabled={locked}
                icon={collectionIcon[collection]}
                menuButton={{
                  ...triggerProps,
                  "aria-label": `Collection: ${name}`,
                }}
                primaryActionButton={{
                  "aria-current": view === "library" ? "page" : undefined,
                  onClick: () => navigate("library"),
                }}
              >
                {name}
              </SplitButton>
            )}
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {collections.map((c) => (
                <MenuItemRadio
                  key={c.id}
                  name="collection"
                  value={c.id}
                  icon={collectionIcon[c.id]}
                >
                  {c.name}
                </MenuItemRadio>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
        {layout[collection].before.map(button)}
        {layout[collection].after.map(button)}
      </nav>
      <div className="toolbar-end">
      {collection === "games" && view === "library" && (
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
      <Button
        title="Settings"
        aria-label="Settings"
        aria-current={view === "settings" ? "page" : undefined}
        appearance={view === "settings" ? "primary" : "subtle"}
        disabled={locked}
        icon={<Settings20Regular />}
        onClick={() => navigate("settings")}
      />
      </div>
    </header>
  );
}
