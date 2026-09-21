import { test, expect, type Page } from "@playwright/test";

// Settings also has a Steam section with buttons of the same names.
const igdb = (page: Page) => page.locator(".igdb-settings");

test("Settings reloads persisted configuration without exposing saved credentials", async ({
  page,
}) => {
  await mock(page, "configured", false);
  for (let startup = 0; startup < 2; startup++) {
    await page.reload();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(
      igdb(page).getByText("Credentials configured", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Client ID", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Client Secret", { exact: true })).toHaveValue(
      "",
    );
    await igdb(page).getByRole("button", { name: "Test connection" }).click();
    await expect(igdb(page).getByText("IGDB connection successful.")).toBeVisible();
  }
});

test("Settings surfaces credential read and write failures", async ({
  page,
}) => {
  await mock(page, "storage-error", false);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(igdb(page).getByRole("alert")).toHaveText(
    "Windows could not read IGDB credentials.",
  );
  await page.getByLabel("Client ID", { exact: true }).fill("synthetic-id");
  await page
    .getByLabel("Client Secret", { exact: true })
    .fill("synthetic-secret");
  await igdb(page).getByRole("button", { name: "Save credentials" }).click();
  await expect(igdb(page).getByRole("alert")).toHaveText(
    "Windows could not save IGDB credentials.",
  );
  await expect(page.getByLabel("Client Secret", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    igdb(page).getByRole("button", { name: "Test connection" }),
  ).toBeDisabled();
});

async function mock(page: Page, mode = "results", add = true) {
  await page.addInitScript(
    ({ mode }) => {
      const w = window as any;
      const platforms = [
        {
          id: 19,
          name: "PC",
          short_name: "PC",
          is_builtin: true,
          icon_path: null,
          sort_order: 0,
        },
        {
          id: 13,
          name: "PlayStation 4",
          short_name: "PS4",
          is_builtin: true,
          icon_path: null,
          sort_order: 1,
        },
      ];
      const input = {
        igdb_id: 42,
        title: "Synthetic Adventure",
        platform_id: 19,
        account: null,
        release_date: "2020-01-01",
        genre: "Adventure, Puzzle",
        developer: "Example Developer",
        publisher: "Example Publisher",
        cover_path: null,
        media_type: "Physical",
        play_status: "Not Started",
        rating: null,
        tags: [],
        notes_html: "",
      };
      let games =
        mode === "duplicate"
          ? [
              {
                ...input,
                id: 1,
                date_added: "2026-01-01",
                date_modified: "2026-01-01",
              },
            ]
          : [];
      w.savedInput = null;
      w.discarded = [];
      w.__TAURI_INTERNALS__ = {
        invoke: async (command: string, args: any) => {
          if (command === "igdb_config") {
            if (mode === "storage-error") throw "Windows could not read IGDB credentials.";
            return { configured: mode === "configured" };
          }
          if (command === "steam_config") return { configured: false };
          if (command === "igdb_test") return;
          if (command === "igdb_save_credentials") throw "Windows could not save IGDB credentials.";
          if (command === "list_games") return games;
          if (command === "list_platforms") return platforms;
          if (command === "get_preferences")
            return {
              library_view: "grid",
              cover_size: "medium",
              library_sort: "title_asc",
            };
          if (command === "get_app_data_info")
            return { appDataDir: "Synthetic in-memory catalog" };
          if (command === "igdb_search") {
            if (mode === "loading") return new Promise(() => {});
            if (mode === "error")
              throw "Unable to reach IGDB/Twitch. Check your connection and try again.";
            if (mode === "empty") return [];
            return [
              {
                igdb_id: 42,
                title: input.title,
                release_year: "2020",
                thumbnail: null,
                version: false,
                platforms:
                  mode === "unmapped"
                    ? [{ id: 999, name: "Unmapped Console", local_id: null }]
                    : [
                        { id: 6, name: "PC (Microsoft Windows)", local_id: 19 },
                        { id: 48, name: "PlayStation 4", local_id: 13 },
                      ],
              },
            ];
          }
          if (command === "igdb_import")
            return {
              input: {
                ...input,
                platform_id: args.localPlatform,
                cover_path: mode === "cover" ? "covers/synthetic.jpg" : null,
              },
              warning:
                "Metadata is ready, but the cover could not be downloaded. You can choose a local cover.",
            };
          if (command === "image_data") return null;
          if (command === "discard_image") {
            w.discarded.push(args.path);
            return;
          }
          if (command === "save_game") {
            w.savedInput = args.input;
            const game = {
              ...args.input,
              id: 2,
              date_added: "2026-01-01",
              date_modified: "2026-01-01",
            };
            games = [...games, game];
            return game;
          }
          throw `Unexpected mocked command: ${command}`;
        },
      };
    },
    { mode },
  );
  await page.goto("/");
  if (add) await page
    .getByRole("button", { name: "Add Game", exact: true })
    .first()
    .click();
}
async function search(page: Page) {
  await page.getByRole("button", { name: "Search IGDB", exact: true }).click();
  await page.getByRole("textbox", { name: "Search IGDB" }).fill("Synthetic");
  await page.getByRole("button", { name: "Search", exact: true }).click();
}
async function review(page: Page) {
  await search(page);
  await page.getByRole("button", { name: /Synthetic Adventure/ }).click();
  await page.getByLabel("IGDB platform", { exact: true }).selectOption("6");
  await page.getByRole("button", { name: "Review import" }).click();
}
test("manual path remains independent of IGDB", async ({ page }) => {
  await mock(page);
  await page.getByRole("button", { name: "Enter Manually" }).click();
  await page.getByRole("textbox", { name: /^Title/ }).fill("Manual fixture");
  await page.getByLabel("Account", { exact: true }).fill("Personal account");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).savedInput?.title))
    .toBe("Manual fixture");
  expect(
    await page.evaluate(() => (window as any).savedInput.igdb_id),
  ).toBeNull();
});
test("search has a loading state and suppresses repeated submissions", async ({
  page,
}) => {
  await mock(page, "loading");
  await search(page);
  await expect(page.getByText("Searching IGDB")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Search", exact: true }),
  ).toBeDisabled();
});
test("failed search offers usable manual fallback", async ({ page }) => {
  await mock(page, "error");
  await search(page);
  await expect(page.getByRole("alert")).toContainText("Unable to reach IGDB");
  await page.getByRole("button", { name: "Enter Manually" }).click();
  await expect(page.getByRole("textbox", { name: /^Title/ })).toBeEditable();
});
test("zero results is not an error", async ({ page }) => {
  await mock(page, "empty");
  await search(page);
  await expect(page.getByText("No IGDB games found.")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("result fields render and multiple platforms require a selection", async ({
  page,
}) => {
  await mock(page);
  await search(page);
  const result = page.getByRole("button", { name: /Synthetic Adventure/ });
  await expect(result).toContainText("2020");
  await expect(result).toContainText("PlayStation 4");
  await expect(result.getByRole("img")).toBeVisible();
  await result.click();
  await expect(
    page.getByRole("button", { name: "Review import" }),
  ).toBeDisabled();
  await page.getByLabel("IGDB platform", { exact: true }).selectOption("48");
  await expect(page.getByLabel("XpieDB platform")).toHaveValue("13");
  await expect(
    page.getByRole("button", { name: "Review import" }),
  ).toBeEnabled();
});
test("unmapped platform needs an explicit managed-platform choice", async ({
  page,
}) => {
  await mock(page, "unmapped");
  await search(page);
  await page.getByRole("button", { name: /Synthetic Adventure/ }).click();
  await expect(page.getByText(/No automatic mapping/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review import" }),
  ).toBeDisabled();
  await page.getByLabel("XpieDB platform").selectOption("19");
  await expect(
    page.getByRole("button", { name: "Review import" }),
  ).toBeEnabled();
});
test("review permits local metadata and personal edits despite cover failure", async ({
  page,
}) => {
  await mock(page);
  await review(page);
  await expect(page.getByRole("textbox", { name: /^Title/ })).toHaveValue(
    "Synthetic Adventure",
  );
  await expect(page.getByLabel("Developer", { exact: true })).toHaveValue(
    "Example Developer",
  );
  await expect(page.getByLabel("Publisher", { exact: true })).toHaveValue(
    "Example Publisher",
  );
  await expect(page.getByLabel("Release date")).toHaveValue("2020-01-01");
  await expect(page.getByLabel("Account", { exact: true })).toHaveValue("");
  await expect(page.getByText(/cover could not be downloaded/)).toBeVisible();
  await page.getByRole("textbox", { name: /^Title/ }).fill("Local title");
  await page.getByLabel("Account", { exact: true }).fill("Personal");
  await page.getByLabel("Media type").selectOption("Digital");
  await page.getByLabel("Play status").selectOption("Playing");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).savedInput?.account))
    .toBe("Personal");
  expect(await page.evaluate(() => (window as any).savedInput)).toMatchObject({
    igdb_id: 42,
    title: "Local title",
    media_type: "Digital",
    play_status: "Playing",
  });
});
test("duplicate warning permits an intentional additional copy", async ({
  page,
}) => {
  await mock(page, "duplicate");
  await review(page);
  await expect(
    page.getByText("This game may already exist in your Library."),
  ).toBeVisible();
  await expect(page.getByText(/Same IGDB ID/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "Save another copy" }).check();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).savedInput?.igdb_id))
    .toBe(42);
});
test("cancel discards the unowned imported cover", async ({ page }) => {
  await mock(page, "cover");
  await review(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.evaluate(() => (window as any).discarded)).toEqual([
    "covers/synthetic.jpg",
  ]);
  expect(await page.evaluate(() => (window as any).savedInput)).toBeNull();
});
