import { test, expect, type Page } from "@playwright/test";
import { installMock, sampleGames, sampleSteamLibrary } from "./libraryMock";

const library = sampleSteamLibrary();
const items = library.items;
const newItems = items.filter((i) => !i.duplicate); // 25
const set = (page: Page, name: string, value: unknown) =>
  page.evaluate(([n, v]) => ((window as any)[n as string] = v), [
    name,
    value,
  ] as const);
const calls = (page: Page) => page.evaluate(() => (window as any).steamCalls);
const importCalls = (page: Page) =>
  page.evaluate(() => (window as any).steamImportCalls);

async function openImport(page: Page, options = {}) {
  await installMock(page, options);
  await page
    .getByRole("button", { name: "Add Game", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Import from Steam" }).click();
  await expect(
    page.getByRole("heading", { name: "Import from Steam" }),
  ).toBeVisible();
}
async function load(page: Page) {
  await page.getByRole("button", { name: "Load my Steam library" }).click();
  await expect(page.getByRole("list", { name: "Steam games" })).toBeVisible();
}
const rows = (page: Page) =>
  page.getByRole("list", { name: "Steam games" }).locator("li");
const box = (page: Page, title: string) =>
  page.getByRole("checkbox", { name: title, exact: true });

test("Add Game offers Import from Steam", async ({ page }) => {
  await installMock(page);
  await page
    .getByRole("button", { name: "Add Game", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Import from Steam" }),
  ).toBeVisible();
});

test("without Steam settings the import explains and links to Settings", async ({
  page,
}) => {
  await openImport(page, { steam: { configured: false } });
  await expect(page.getByText("Steam is not set up yet.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load my Steam library" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Open Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("loading shows the account, match counts and every game with its status", async ({
  page,
}) => {
  await openImport(page);
  await load(page);
  const matched = items.filter((i) => i.matched).length;
  await expect(page.getByRole("status").first()).toHaveText(
    `Test Player: 27 games on Steam. ${matched} matched on IGDB, 2 already in your library.`,
  );
  await expect(rows(page)).toHaveCount(27);
  await expect(page.getByText("25 of 27 selected")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import 25 games" }),
  ).toBeEnabled();
  // A matched game shows its year, genre and play time.
  await expect(rows(page).filter({ hasText: "Steam Game 01" })).toContainText(
    "Action, Indie",
  );
  await expect(rows(page).filter({ hasText: "Steam Game 01" })).toContainText(
    "17 min",
  );
  await expect(rows(page).filter({ hasText: "Steam Game 01" })).toContainText(
    "Matched",
  );
  // Unplayed and unmatched games are labelled as such.
  await expect(rows(page).filter({ hasText: "Steam Game 05" })).toContainText(
    "No IGDB match",
  );
  await expect(rows(page).filter({ hasText: "Steam Game 03" })).toContainText(
    "Never played",
  );
});

test("games already in the library cannot be selected", async ({ page }) => {
  await openImport(page);
  await load(page);
  const dup = box(page, "Steam Game 02");
  await expect(dup).toBeDisabled();
  await expect(dup).not.toBeChecked();
  await expect(rows(page).filter({ hasText: "Steam Game 02" })).toContainText(
    "Already in library",
  );
  await page.getByRole("button", { name: "Select all shown" }).click();
  await expect(dup).not.toBeChecked();
  await expect(page.getByText("25 of 27 selected")).toBeVisible();
});

test("filtering, and select all or none, only affect the games shown", async ({
  page,
}) => {
  await openImport(page);
  await load(page);
  await page.getByLabel("Filter games").fill("Game 2");
  // Titles containing "2": 02, 12 and 20-27 — ten rows, one of them (02) already in the library.
  await expect(rows(page)).toHaveCount(10);
  await page.getByRole("button", { name: "Select none shown" }).click();
  await expect(page.getByText("16 of 27 selected")).toBeVisible();
  await page.getByRole("button", { name: "Select all shown" }).click();
  await expect(page.getByText("25 of 27 selected")).toBeVisible();
  await page.getByLabel("Filter games").fill("no such game");
  await expect(page.getByText("No games match that filter.")).toBeVisible();
  await page.getByLabel("Filter games").fill("");
  await expect(rows(page)).toHaveCount(27);
});

test("single games can be toggled and Import is disabled when none are selected", async ({
  page,
}) => {
  await openImport(page);
  await load(page);
  await box(page, "Steam Game 01").uncheck();
  await expect(page.getByText("24 of 27 selected")).toBeVisible();
  await page.getByRole("button", { name: "Select none shown" }).click();
  await expect(page.getByText("0 of 27 selected")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import", exact: true }),
  ).toBeDisabled();
});

test("importing sends the selection in groups of ten and reports the result", async ({
  page,
}) => {
  await openImport(page);
  await load(page);
  await page.getByRole("button", { name: "Import 25 games" }).click();
  await expect(
    page.getByRole("heading", { name: "Import finished" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Added 25 games." }),
  ).toBeVisible();
  const sent = await importCalls(page);
  expect(sent.map((c: any) => c.appids.length)).toEqual([10, 10, 5]);
  // Everything selected was sent once, in list order, and never a duplicate.
  expect(sent.flatMap((c: any) => c.appids)).toEqual(
    newItems.map((i) => i.appid),
  );
  expect(sent[0].options).toEqual({ backlog_unplayed: false, account: null });
  // The library now has the new games.
  await page.getByRole("button", { name: "Go to Library" }).click();
  await expect(page.locator(".library-summary")).toContainText("85 games");
});

test("the backlog option and account label are sent and unplayed games join the backlog", async ({
  page,
}) => {
  await openImport(page);
  await load(page);
  await page.getByLabel("Add games I have never played to my Backlog").check();
  await page.getByLabel("Account label (optional)").fill("Steam Main");
  await page.getByRole("button", { name: "Import 25 games" }).click();
  await expect(
    page.getByRole("heading", { name: "Import finished" }),
  ).toBeVisible();
  const sent = await importCalls(page);
  expect(sent[0].options).toEqual({
    backlog_unplayed: true,
    account: "Steam Main",
  });
  // Never-played games among the new ones: 3, 6, 9, 12, 15, 18, 21, 24, 27.
  await page.getByRole("button", { name: "Go to Library" }).click();
  await page.getByRole("button", { name: "Backlog", exact: true }).click();
  await expect(page.locator(".backlog-row")).toHaveCount(6 + 9);
  await expect(page.locator(".backlog-row").nth(6)).toContainText(
    "Steam Game 03",
  );
  await expect(page.locator(".backlog-row").last()).toContainText(
    "Steam Game 27",
  );
});

test("games that turn out to be in the library already are skipped and counted", async ({
  page,
}) => {
  const games = [
    ...sampleGames(),
    {
      ...sampleGames()[0],
      id: 900,
      title: "Steam Game 04",
      platform_id: 18,
      backlog_position: null,
      play_status: "Not Started",
    },
  ];
  await openImport(page, { games });
  await load(page);
  await page.getByRole("button", { name: "Import 25 games" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Added 24 games" }),
  ).toContainText("skipped 1 already in your library");
});

test("a failed cover download still adds the game and says so", async ({
  page,
}) => {
  await openImport(page);
  await load(page);
  await set(page, "steamCoverFail", [1001, 1004]);
  await page.getByRole("button", { name: "Import 25 games" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Added 25 games" }),
  ).toContainText(
    "2 games added without a cover because it could not be downloaded.",
  );
});

test("individual failures are listed while the rest are added", async ({
  page,
}) => {
  await openImport(page);
  await load(page);
  await set(page, "steamFail", {
    1003: "Enter a title of 1 to 300 characters.",
  });
  await page.getByRole("button", { name: "Import 25 games" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Added 24 games" }),
  ).toContainText("1 failed");
  await expect(page.locator(".steam-problems")).toContainText(
    "Steam Game 03: Enter a title of 1 to 300 characters.",
  );
});

test("Stop finishes the current group and leaves the rest alone", async ({
  page,
}) => {
  await openImport(page);
  await load(page);
  await set(page, "steamDelay", 400);
  await page.getByRole("button", { name: "Import 25 games" }).click();
  await expect(page.getByText(/Importing\.\.\. 0 of 25 done/)).toBeVisible();
  await page.getByRole("button", { name: "Stop after this group" }).click();
  await expect(
    page.getByRole("heading", { name: "Import stopped" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Added 10 games" }),
  ).toContainText("15 not imported");
  expect((await importCalls(page)).length).toBe(1);
});

test("an error partway through stops the import and reports what was not attempted", async ({
  page,
}) => {
  await openImport(page);
  await load(page);
  await set(page, "steamThrowAtCall", 2);
  await page.getByRole("button", { name: "Import 25 games" }).click();
  await expect(
    page.getByRole("heading", { name: "Import stopped" }),
  ).toBeVisible();
  const text = page.getByRole("status").filter({ hasText: "Added 10 games" });
  await expect(text).toContainText("10 failed");
  await expect(text).toContainText("5 not imported");
  await expect(page.locator(".steam-problems")).toContainText(
    "no longer loaded",
  );
  expect((await importCalls(page)).length).toBe(2);
});

test("navigation is locked while importing and unlocked afterwards", async ({
  page,
}) => {
  await openImport(page);
  await load(page);
  await set(page, "steamDelay", 300);
  await page.getByRole("button", { name: "Import 25 games" }).click();
  await expect(page.getByText(/Importing/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Backlog", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Library" }).last(),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Import finished" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByRole("button", { name: "Backlog", exact: true }),
  ).toBeEnabled();
});

test("a private profile shows Steam's instructions and lets you retry", async ({
  page,
}) => {
  await openImport(page);
  await set(
    page,
    "steamLoadError",
    "Steam did not return any games. In Steam, open your profile, choose Edit Profile > Privacy Settings, and set Game details to Public (you can turn it back afterwards). Then try again.",
  );
  await page.getByRole("button", { name: "Load my Steam library" }).click();
  await expect(page.getByRole("alert")).toContainText("Game details to Public");
  await set(page, "steamLoadError", null);
  await page.getByRole("button", { name: "Load my Steam library" }).click();
  await expect(rows(page)).toHaveCount(27);
});

test("the loading state is shown and the page is locked while matching", async ({
  page,
}) => {
  await openImport(page);
  await set(page, "steamLoadDelay", 400);
  await page.getByRole("button", { name: "Load my Steam library" }).click();
  await expect(page.getByText(/matching it with IGDB/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Backlog", exact: true }),
  ).toBeDisabled();
  await expect(rows(page)).toHaveCount(27);
});

test("without IGDB the import says games will have Steam titles only", async ({
  page,
}) => {
  await openImport(page, {
    steam: { library: { ...sampleSteamLibrary(), matching_available: false } },
  });
  await load(page);
  await expect(
    page.getByText(
      "IGDB is not set up, so games will be added with their Steam titles only.",
    ),
  ).toBeVisible();
});

test("Reload loads the library again", async ({ page }) => {
  await openImport(page);
  await load(page);
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(rows(page)).toHaveCount(27);
  expect(
    (await calls(page)).filter((c: string[]) => c[0] === "load").length,
  ).toBe(2);
});

test("leaving the import screen forgets the loaded library", async ({
  page,
}) => {
  await openImport(page);
  await load(page);
  await page.getByRole("button", { name: "Library" }).last().click();
  await expect(
    page.getByRole("heading", { name: "Library", exact: true }),
  ).toBeVisible();
  expect(
    (await calls(page)).some((c: string[]) => c[0] === "clear_cache"),
  ).toBe(true);
});

// ---- Settings ----

const steamSection = (page: Page) => page.locator(".steam-settings");
async function openSettings(page: Page, options = {}) {
  await installMock(page, options);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(steamSection(page)).toBeVisible();
}

test("Settings shows whether Steam is set up and disables actions until it is", async ({
  page,
}) => {
  await openSettings(page, { steam: { configured: false } });
  await expect(steamSection(page).getByText("Not configured")).toBeVisible();
  await expect(
    steamSection(page).getByRole("button", { name: "Test connection" }),
  ).toBeDisabled();
  await expect(
    steamSection(page).getByRole("button", { name: "Clear Steam settings" }),
  ).toBeDisabled();
  await expect(
    steamSection(page).getByRole("button", { name: "Save Steam settings" }),
  ).toBeDisabled();
});

test("saving Steam settings sends the key and profile, then clears the key field", async ({
  page,
}) => {
  await openSettings(page, { steam: { configured: false } });
  const key = steamSection(page).getByLabel("Steam API key");
  await expect(key).toHaveAttribute("type", "password");
  await key.fill("0123456789abcdef0123456789abcdef");
  await steamSection(page).getByLabel("Steam profile").fill("gaben");
  await steamSection(page)
    .getByRole("button", { name: "Save Steam settings" })
    .click();
  await expect(
    steamSection(page).getByText("Steam settings saved").first(),
  ).toBeVisible();
  expect((await calls(page))[0]).toEqual([
    "save",
    { apiKey: "0123456789abcdef0123456789abcdef", profile: "gaben" },
  ]);
  await expect(key).toHaveValue("");
  await expect(
    steamSection(page).getByRole("button", { name: "Test connection" }),
  ).toBeEnabled();
});

test("a rejected save shows the reason and still clears the key field", async ({
  page,
}) => {
  await openSettings(page, { steam: { configured: false } });
  await set(
    page,
    "steamSaveError",
    "A Steam API key is 32 letters and numbers (0-9, a-f).",
  );
  await steamSection(page).getByLabel("Steam API key").fill("short");
  await steamSection(page).getByLabel("Steam profile").fill("gaben");
  await steamSection(page)
    .getByRole("button", { name: "Save Steam settings" })
    .click();
  await expect(steamSection(page).getByRole("alert")).toContainText(
    "32 letters and numbers",
  );
  await expect(steamSection(page).getByLabel("Steam API key")).toHaveValue("");
  await expect(steamSection(page).getByText("Not configured")).toBeVisible();
});

test("Test connection reports the game count and account, or the error", async ({
  page,
}) => {
  await openSettings(page);
  await steamSection(page)
    .getByRole("button", { name: "Test connection" })
    .click();
  await expect(
    steamSection(page).getByText(
      "Steam connection successful: 27 games for Test Player.",
    ),
  ).toBeVisible();
  await set(
    page,
    "steamTestError",
    "Steam rejected the API key. Check it in Settings.",
  );
  await steamSection(page)
    .getByRole("button", { name: "Test connection" })
    .click();
  await expect(steamSection(page).getByRole("alert")).toContainText(
    "rejected the API key",
  );
});

test("Clear removes the Steam settings", async ({ page }) => {
  await openSettings(page);
  await steamSection(page)
    .getByRole("button", { name: "Clear Steam settings" })
    .click();
  await expect(steamSection(page).getByText("Not configured")).toBeVisible();
  expect((await calls(page)).some((c: string[]) => c[0] === "clear")).toBe(
    true,
  );
});

test("the API key link opens in the browser", async ({ page }) => {
  await openSettings(page);
  await steamSection(page)
    .getByRole("link", { name: "Get an API key" })
    .click();
  expect(await page.evaluate(() => (window as any).openedLinks)).toEqual([
    "https://steamcommunity.com/dev/apikey",
  ]);
});
