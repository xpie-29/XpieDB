import { useEffect, useRef, type KeyboardEvent } from "react";
import { Button, Input, Select } from "@fluentui/react-components";
import {
  Add20Regular,
  ChevronDown16Regular,
  ChevronRight16Regular,
  Delete20Regular,
  Dismiss16Regular,
  Edit20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import type { Hardware, Platform } from "../types";
import { hardwareStatuses } from "../types";
import {
  formatPrice,
  hardwareFiltersActive,
  type HardwareFilters,
  type HardwareRow,
} from "../hardwareQuery";
import { meaningfulNotes } from "../notes";
import { ManagedImage, PlatformIcon } from "./Shared";
import { NotesView } from "./NotesView";

export function HardwareLibrary({
  rows,
  total,
  shown,
  platforms,
  all,
  filters,
  setFilters,
  grouping,
  setGrouping,
  toggle,
  setAllOpen,
  selected,
  select,
  add,
  addAccessory,
  edit,
  remove,
  error,
  scroll,
  highlight,
}: {
  rows: HardwareRow[];
  /** Everything in the collection, and how many items match the filters. */
  total: number;
  shown: number;
  platforms: Platform[];
  all: Hardware[];
  filters: HardwareFilters;
  setFilters: (filters: HardwareFilters) => void;
  grouping: "grouped" | "flat";
  setGrouping: (grouping: "grouped" | "flat") => void;
  toggle: (id: number) => void;
  setAllOpen: (open: boolean) => void;
  selected: number | null;
  select: (id: number) => void;
  add: () => void;
  addAccessory: (system: Hardware) => void;
  edit: (item: Hardware) => void;
  remove: (item: Hardware) => void;
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
  const selectedItem = all.find((h) => h.id === selected) ?? null;
  const ids = rows.flatMap((r) => (r.type === "item" ? [r.item.id] : []));
  const keyboard = (e: KeyboardEvent, row: HardwareRow & { type: "item" }) => {
    const at = ids.indexOf(row.item.id);
    let next = at;
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
        next = ids.length - 1;
        break;
      case "ArrowRight":
        if (row.children && !row.expanded) {
          e.preventDefault();
          toggle(row.item.id);
        }
        return;
      case "ArrowLeft":
        if (row.children && row.expanded) {
          e.preventDefault();
          toggle(row.item.id);
        }
        return;
      case " ":
      case "Enter":
        e.preventDefault();
        select(row.item.id);
        return;
      default:
        return;
    }
    e.preventDefault();
    next = Math.max(0, Math.min(ids.length - 1, next));
    select(ids[next]);
    entries.current[ids[next]]?.focus();
  };
  const filtered = hardwareFiltersActive(filters);
  const systemsCount = all.filter((h) => h.kind === "system").length;
  return (
    <div className="library-view hardware-view">
      <div className="library-utility">
        <div
          className="library-controls"
          role="search"
          aria-label="Hardware search and filters"
        >
          <Input
            className="library-search"
            aria-label="Search hardware"
            placeholder="Search hardware"
            contentBefore={<Search20Regular />}
            value={filters.search}
            onChange={(_, d) => setFilters({ ...filters, search: d.value })}
          />
          <Select
            aria-label="Type"
            value={filters.kind}
            onChange={(_, d) => setFilters({ ...filters, kind: d.value })}
          >
            <option value="">All types</option>
            <option value="system">Systems</option>
            <option value="accessory">Accessories</option>
          </Select>
          <Select
            aria-label="Status"
            value={filters.status}
            onChange={(_, d) => setFilters({ ...filters, status: d.value })}
          >
            <option value="">All statuses</option>
            {hardwareStatuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <Button
            appearance="subtle"
            disabled={!filtered}
            icon={<Dismiss16Regular />}
            onClick={() => setFilters({ search: "", kind: "", status: "" })}
          >
            Clear
          </Button>
          <div className="view-toggle" role="group" aria-label="List layout">
            <Button
              aria-pressed={grouping === "grouped"}
              appearance={grouping === "grouped" ? "primary" : "subtle"}
              onClick={() => setGrouping("grouped")}
            >
              Grouped
            </Button>
            <Button
              aria-pressed={grouping === "flat"}
              appearance={grouping === "flat" ? "primary" : "subtle"}
              onClick={() => setGrouping("flat")}
            >
              Flat
            </Button>
          </div>
          <Button
            appearance="subtle"
            disabled={grouping === "flat"}
            onClick={() => setAllOpen(true)}
          >
            Expand all
          </Button>
          <Button
            appearance="subtle"
            disabled={grouping === "flat"}
            onClick={() => setAllOpen(false)}
          >
            Collapse all
          </Button>
        </div>
      </div>
      <div className="library-workspace">
        <section
          className="library-pane"
          aria-label="Hardware content"
          tabIndex={-1}
          ref={pane}
          onScroll={(e) => {
            scroll.current = e.currentTarget.scrollTop;
          }}
        >
          <div className="library-summary">
            <h1>Hardware</h1>
            <span className="muted" role="status">
              {filtered
                ? `${shown} of ${total} items`
                : `${total} ${total === 1 ? "item" : "items"} · ${systemsCount} ${systemsCount === 1 ? "system" : "systems"}`}
            </span>
          </div>
          {!rows.length ? (
            <div className="empty">
              <h2>
                {total
                  ? "No hardware matches the current search and filters."
                  : "No hardware yet"}
              </h2>
              <Button
                icon={total ? undefined : <Add20Regular />}
                onClick={
                  total
                    ? () => setFilters({ search: "", kind: "", status: "" })
                    : add
                }
              >
                {total ? "Clear All Filters" : "Add Hardware"}
              </Button>
            </div>
          ) : (
            <div
              className="game-list hardware-list"
              role="treegrid"
              aria-label="Hardware"
            >
              <div className="hw-row hw-heading" role="row">
                <span role="columnheader">Platform</span>
                <span role="columnheader">Name</span>
                <span role="columnheader">
                  {grouping === "flat" ? "Belongs to" : "Type"}
                </span>
                <span role="columnheader">Condition</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Paid</span>
              </div>
              {rows.map((row) =>
                row.type === "group" ? (
                  <div
                    key={row.key}
                    className="hw-group"
                    role="row"
                    aria-label={`${row.label}, ${row.count}`}
                  >
                    <span role="gridcell">
                      {row.label} <span className="muted">({row.count})</span>
                    </span>
                  </div>
                ) : (
                  <div
                    key={row.item.id}
                    ref={(el) => {
                      entries.current[row.item.id] = el;
                    }}
                    className={`hw-row ${selected === row.item.id ? "selected" : ""} ${row.dimmed ? "dimmed" : ""} ${highlight === row.item.id ? "just-edited" : ""}`}
                    role="row"
                    aria-level={row.depth + 1}
                    aria-expanded={row.children ? row.expanded : undefined}
                    aria-selected={selected === row.item.id}
                    tabIndex={selected === row.item.id ? 0 : -1}
                    onClick={() => select(row.item.id)}
                    onKeyDown={(e) => keyboard(e, row)}
                  >
                    <span role="gridcell">
                      {row.item.platform_id === null ? (
                        <span className="muted" title="No platform">
                          -
                        </span>
                      ) : (
                        <PlatformIcon
                          platform={platforms.find(
                            (p) => p.id === row.item.platform_id,
                          )}
                        />
                      )}
                    </span>
                    <span
                      role="gridcell"
                      className={`hw-name depth-${row.depth}`}
                      title={row.item.name}
                    >
                      {row.children > 0 ? (
                        <button
                          type="button"
                          className="hw-toggle"
                          tabIndex={-1}
                          aria-label={`${row.expanded ? "Collapse" : "Expand"} ${row.item.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(row.item.id);
                          }}
                        >
                          {row.expanded ? (
                            <ChevronDown16Regular />
                          ) : (
                            <ChevronRight16Regular />
                          )}
                        </button>
                      ) : (
                        <span className="hw-toggle-space" />
                      )}
                      <span className="hw-name-text">{row.item.name}</span>
                      {row.children > 0 && (
                        <span className="muted hw-count">
                          {row.children}
                        </span>
                      )}
                    </span>
                    <span role="gridcell">
                      {grouping === "flat"
                        ? (row.parentName ??
                          (row.item.kind === "accessory" ? "Loose" : "System"))
                        : row.item.kind === "system"
                          ? "System"
                          : "Accessory"}
                    </span>
                    <span role="gridcell" title={row.item.condition ?? ""}>
                      {row.item.condition ?? "-"}
                    </span>
                    <span role="gridcell">{row.item.status}</span>
                    <span role="gridcell">
                      {formatPrice(row.item.purchase_price_cents)}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </section>
        {selectedItem && (
          <HardwareDetail
            item={selectedItem}
            platforms={platforms}
            all={all}
            select={select}
            edit={() => edit(selectedItem)}
            remove={() => remove(selectedItem)}
            addAccessory={() => addAccessory(selectedItem)}
            error={error}
          />
        )}
      </div>
    </div>
  );
}

function HardwareDetail({
  item,
  platforms,
  all,
  select,
  edit,
  remove,
  addAccessory,
  error,
}: {
  item: Hardware;
  platforms: Platform[];
  all: Hardware[];
  select: (id: number) => void;
  edit: () => void;
  remove: () => void;
  addAccessory: () => void;
  error: (message: string) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [item.id]);
  const platform = platforms.find((p) => p.id === item.platform_id);
  const parent = all.find((h) => h.id === item.parent_id);
  const accessories = all
    .filter((h) => h.parent_id === item.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const compat = item.compat_platform_ids
    .map((id) => platforms.find((p) => p.id === id))
    .filter((p): p is Platform => Boolean(p));
  const gone = item.status !== "Owned";
  const fields: Array<[string, string | null]> = [
    ["Type", item.kind === "system" ? "System" : "Accessory"],
    ["Manufacturer", item.manufacturer],
    ["Model", item.model],
    ["Region", item.region],
    ["Serial number", item.serial],
    ["Color or edition", item.color],
    ["Condition", item.condition],
    ["Completeness", item.completeness],
    ["Working", item.is_working ? "Yes" : "No"],
    ["Modded", item.is_modded ? "Yes" : "No"],
    ["Purchase date", item.purchase_date],
    ["Price paid", formatPrice(item.purchase_price_cents)],
    ["Bought from", item.purchase_source],
    ["Status", item.status],
    ...(gone
      ? ([
          [`${item.status} on`, item.sale_date],
          ["Price received", formatPrice(item.sale_price_cents)],
        ] as Array<[string, string | null]>)
      : []),
  ];
  return (
    <aside
      ref={panel}
      className="detail-sidebar"
      aria-label="Selected hardware details"
      tabIndex={0}
    >
      <div className="detail-actions">
        <Button
          title="Edit item"
          aria-label="Edit"
          icon={<Edit20Regular />}
          appearance="subtle"
          onClick={edit}
        />
        <Button
          title="Delete hardware"
          aria-label="Delete hardware"
          icon={<Delete20Regular />}
          appearance="subtle"
          onClick={remove}
        />
      </div>
      <ManagedImage
        path={item.photo_path}
        alt={`${item.name} photo`}
        className="cover inspector-cover"
      />
      <h2 className="game-title">{item.name}</h2>
      <dl className="metadata">
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
        {item.kind === "accessory" && (
          <div>
            <dt>Belongs to</dt>
            <dd>
              {parent ? (
                <Button
                  appearance="transparent"
                  size="small"
                  onClick={() => select(parent.id)}
                >
                  {parent.name}
                </Button>
              ) : item.former_parent_name ? (
                <span>
                  Loose (was with {item.former_parent_name})
                </span>
              ) : (
                "Loose accessory"
              )}
            </dd>
          </div>
        )}
        {compat.length > 0 && (
          <div>
            <dt>Also works with</dt>
            <dd>{compat.map((p) => p.name).join(", ")}</dd>
          </div>
        )}
        {fields.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value || "-"}</dd>
          </div>
        ))}
      </dl>
      {item.kind === "system" && (
        <section aria-label="Accessories" className="detail-links">
          <h3>Accessories ({accessories.length})</h3>
          {accessories.length ? (
            <ul className="accessory-list">
              {accessories.map((a) => (
                <li key={a.id}>
                  <Button
                    appearance="transparent"
                    size="small"
                    onClick={() => select(a.id)}
                  >
                    {a.name}
                  </Button>
                  {a.status !== "Owned" && (
                    <span className="muted"> {a.status}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No accessories</p>
          )}
          <Button icon={<Add20Regular />} onClick={addAccessory}>
            Add accessory
          </Button>
        </section>
      )}
      <section className="detail-notes">
        <h3>Notes</h3>
        {meaningfulNotes(item.notes_html) ? (
          <NotesView html={item.notes_html} onError={error} />
        ) : (
          <p className="muted">No notes</p>
        )}
      </section>
      <p className="muted timestamps">
        Added {new Date(item.date_added).toLocaleDateString()} · Modified{" "}
        {new Date(item.date_modified).toLocaleDateString()}
      </p>
    </aside>
  );
}
