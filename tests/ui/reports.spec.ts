import { test, expect, type Page } from "@playwright/test";

type Mode = "ok" | "cancelled" | "error" | "unsupported" | "empty" | "slow";

test("the two presets are offered and the default report is all games", async ({
  page,
}) => {
  await mock(page, "ok");
  await expect(
    page.getByRole("radio", { name: "All games, alphabetical" }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Games by platform" }),
  ).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Platform" })).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Release year" }),
  ).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Genre" })).not.toBeChecked();
});

test("creating a report sends the chosen options and reports the result", async ({
  page,
}) => {
  await mock(page, "ok");
  await page.getByRole("button", { name: "Create PDF..." }).click();
  await expect(reports(page).getByRole("status")).toHaveText(
    "Saved 12 games on 2 pages to /Users/me/Reports/all-games.pdf.",
  );
  expect(await requests(page)).toEqual([
    {
      group_by: "none",
      paper: "letter",
      landscape: false,
      columns: ["platform", "year", "status", "rating"],
    },
  ]);
});

test("by-platform hides the platform column and sends the platform grouping", async ({
  page,
}) => {
  await mock(page, "ok");
  await page.getByRole("radio", { name: "Games by platform" }).check();
  await expect(page.getByRole("checkbox", { name: "Platform" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Genre" }).check();
  await page.getByRole("checkbox", { name: "Rating" }).uncheck();
  await page.getByRole("button", { name: "Create PDF..." }).click();
  await expect(reports(page).getByRole("status")).toBeVisible();
  const [request] = await requests(page);
  expect(request.group_by).toBe("platform");
  expect(request.columns).toEqual(["year", "status", "genre"]);

  // Switching back restores the platform column, still selected.
  await page.getByRole("radio", { name: "All games, alphabetical" }).check();
  await expect(page.getByRole("checkbox", { name: "Platform" })).toBeChecked();
});

test("paper size and orientation are saved as preferences and used", async ({
  page,
}) => {
  await mock(page, "ok");
  await page.getByLabel("Paper size").selectOption("a4");
  await page.getByLabel("Orientation").selectOption("landscape");
  await page.getByRole("button", { name: "Create PDF..." }).click();
  await expect(reports(page).getByRole("status")).toBeVisible();
  const [request] = await requests(page);
  expect(request.paper).toBe("a4");
  expect(request.landscape).toBe(true);
  expect(await preferenceWrites(page)).toEqual([
    ["report_paper", "a4"],
    ["report_orientation", "landscape"],
  ]);
});

test("saved paper preferences are applied when the page opens", async ({
  page,
}) => {
  await mock(page, "ok", {
    report_paper: "a4",
    report_orientation: "landscape",
  });
  await expect(page.getByLabel("Paper size")).toHaveValue("a4");
  await expect(page.getByLabel("Orientation")).toHaveValue("landscape");
});

test("cancelling the save dialog is silent", async ({ page }) => {
  await mock(page, "cancelled");
  await page.getByRole("button", { name: "Create PDF..." }).click();
  await expect(reports(page).getByRole("status")).toHaveCount(0);
  await expect(reports(page).getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create PDF..." }),
  ).toBeEnabled();
});

test("failures are shown and the page stays usable", async ({ page }) => {
  await mock(page, "error");
  await page.getByRole("button", { name: "Create PDF..." }).click();
  await expect(reports(page).getByRole("alert")).toHaveText(
    "The report could not be saved: Permission denied",
  );
  await expect(
    page.getByRole("button", { name: "Create PDF..." }),
  ).toBeEnabled();
});

test("unprintable characters produce a visible warning", async ({ page }) => {
  await mock(page, "unsupported");
  await page.getByRole("button", { name: "Create PDF..." }).click();
  await expect(reports(page).getByRole("status").nth(1)).toHaveText(
    "11 characters could not be printed with the report font (for example Japanese or Korean text) and appear as ?.",
  );
});

test("an empty library cannot create a report", async ({ page }) => {
  await mock(page, "empty");
  await expect(
    page.getByRole("button", { name: "Create PDF..." }),
  ).toBeDisabled();
  await expect(
    page.getByText("Add games to your library to create a report."),
  ).toBeVisible();
});

test("navigation and the button are locked while the PDF is being created", async ({
  page,
}) => {
  await mock(page, "slow");
  await page.getByRole("button", { name: "Create PDF..." }).click();
  await expect(page.getByText("Creating PDF...")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create PDF..." }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Library", exact: true }),
  ).toBeDisabled();
});

const reports = (page: Page) => page.locator(".reports");

async function requests(page: Page) {
  return page.evaluate(() => (window as any).reportRequests);
}
async function preferenceWrites(page: Page) {
  return page.evaluate(() => (window as any).preferenceWrites);
}

async function mock(
  page: Page,
  mode: Mode,
  saved: Record<string, string> = {},
) {
  await page.addInitScript(
    ({ mode, saved }) => {
      const w = window as any;
      const game = (id: number) => ({
        id,
        igdb_id: null,
        title: `Game ${id}`,
        platform_id: 19,
        account: null,
        release_date: null,
        genre: null,
        developer: null,
        publisher: null,
        cover_path: null,
        media_type: "Physical",
        play_status: "Not Started",
        rating: null,
        tags: [],
        notes_html: "",
        date_added: "2026-01-01",
        date_modified: "2026-01-01",
      });
      const games = mode === "empty" ? [] : [game(1), game(2)];
      w.reportRequests = [];
      w.preferenceWrites = [];
      w.__TAURI_INTERNALS__ = {
        invoke: async (command: string, args: any) => {
          if (command === "list_games") return games;
          if (command === "list_platforms")
            return [
              {
                id: 19,
                name: "PC",
                short_name: "PC",
                is_builtin: true,
                icon_path: null,
                sort_order: 0,
              },
            ];
          if (command === "get_preferences")
            return {
              library_view: "grid",
              cover_size: "medium",
              library_sort: "title_asc",
              ...saved,
            };
          if (command === "set_preference") {
            w.preferenceWrites.push([args.key, args.value]);
            return;
          }
          if (command === "get_app_data_info")
            return { appDataDir: "Synthetic in-memory catalog" };
          if (command === "report_create") {
            w.reportRequests.push(args.request);
            if (mode === "cancelled") return null;
            if (mode === "slow") return new Promise(() => {});
            if (mode === "error")
              throw "The report could not be saved: Permission denied";
            return {
              path: "/Users/me/Reports/all-games.pdf",
              games: 12,
              pages: 2,
              unsupported_characters: mode === "unsupported" ? 11 : 0,
            };
          }
          throw `Unexpected mocked command: ${command}`;
        },
      };
    },
    { mode, saved },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Reports", exact: true }).click();
}
