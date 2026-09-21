import { useEffect, useRef } from "react";
import {
  Button,
  Field,
  Input,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Select,
} from "@fluentui/react-components";
import {
  Dismiss20Regular,
  Filter20Regular,
  FilterDismiss20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import { statuses, type Game, type Platform } from "../types";
import {
  distinctValues,
  filterCount,
  hasFilters,
  sortOptions,
  type LibraryFilters,
} from "../libraryQuery";

// Cmd+F on macOS (Ctrl+F is cursor movement in text fields there); Ctrl+F elsewhere.
const isMac = navigator.userAgent.includes("Macintosh");

export function LibraryUtilityBar({
  games,
  platforms,
  filters,
  change,
  clear,
  sort,
  setSort,
}: {
  games: Game[];
  platforms: Platform[];
  filters: LibraryFilters;
  change: (filters: LibraryFilters) => void;
  clear: () => void;
  sort: string;
  setSort: (sort: string) => void;
}) {
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (
        (isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey) &&
        event.key.toLowerCase() === "f" &&
        !event.altKey &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        search.current?.focus();
        search.current?.select();
      }
    };
    window.addEventListener("keydown", focus);
    return () => window.removeEventListener("keydown", focus);
  }, []);
  const update = (key: keyof LibraryFilters, value: string) =>
    change({ ...filters, [key]: value });
  const accounts = distinctValues(games.map((g) => g.account));
  const genres = distinctValues(games.map((g) => g.genre));
  const tags = distinctValues(games.flatMap((g) => g.tags));
  const categories: Array<{
    key: keyof LibraryFilters;
    label: string;
    all: string;
    options: Array<readonly [string, string]>;
  }> = [
    {
      key: "platform",
      label: "Platform",
      all: "All Platforms",
      options: platforms.map((p) => [String(p.id), p.name]),
    },
    {
      key: "account",
      label: "Account",
      all: "All Accounts",
      options: [
        ["none", "No Account"],
        ...accounts.map(
          ([key, value]) =>
            [
              `value:${key}`,
              ["no account", "all accounts"].includes(key)
                ? `${value} (named account)`
                : value,
            ] as const,
        ),
      ],
    },
    {
      key: "status",
      label: "Play Status",
      all: "All Statuses",
      options: statuses.map((s) => [s, s]),
    },
    { key: "genre", label: "Genre", all: "All Genres", options: genres },
    { key: "tag", label: "Tag", all: "All Tags", options: tags },
    {
      key: "media",
      label: "Media Type",
      all: "All Media Types",
      options: [
        ["Physical", "Physical"],
        ["Digital", "Digital"],
      ],
    },
  ];
  const active = filterCount(filters);
  const summary = categories
    .filter((c) => filters[c.key])
    .map(
      (c) =>
        `${c.label}: ${c.options.find(([key]) => key === filters[c.key])?.[1] ?? filters[c.key]}`,
    )
    .join("; ");
  return (
    <div
      className="library-controls"
      role="search"
      aria-label="Library search and filters"
    >
      <Input
        ref={search}
        className="library-search"
        aria-label="Search games"
        placeholder="Search games"
        value={filters.search}
        contentBefore={<Search20Regular />}
        onChange={(_, data) => update("search", data.value)}
        contentAfter={
          filters.search ? (
            <Button
              appearance="transparent"
              size="small"
              icon={<Dismiss20Regular />}
              title="Clear search"
              aria-label="Clear search"
              onClick={() => {
                update("search", "");
                search.current?.focus();
              }}
            />
          ) : undefined
        }
      />
      <Popover positioning="below-end">
        <PopoverTrigger disableButtonEnhancement>
          <Button
            icon={<Filter20Regular />}
            appearance={active ? "primary" : "subtle"}
            title={summary || "Filters"}
          >
            Filters{active ? ` (${active})` : ""}
          </Button>
        </PopoverTrigger>
        <PopoverSurface aria-label="Library filters">
          <div className="filter-fields">
            {categories.map((c) => (
              <Field key={c.key} label={c.label}>
                <Select
                  value={filters[c.key]}
                  onChange={(_, data) => update(c.key, data.value)}
                >
                  <option value="">{c.all}</option>
                  {filters[c.key] &&
                    !c.options.some(([key]) => key === filters[c.key]) && (
                      <option value={filters[c.key]}>
                        {filters[c.key].replace(/^value:/, "")} (unavailable)
                      </option>
                    )}
                  {c.options.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        </PopoverSurface>
      </Popover>
      <Select
        className="library-sort"
        aria-label="Sort games"
        value={sort}
        onChange={(_, data) => setSort(data.value)}
      >
        {sortOptions.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>
      <Button
        appearance="subtle"
        icon={<FilterDismiss20Regular />}
        title="Clear All Filters"
        aria-label="Clear All Filters"
        disabled={!hasFilters(filters) && !filters.search}
        onClick={clear}
      />
    </div>
  );
}
