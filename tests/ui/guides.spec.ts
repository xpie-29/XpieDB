import { test, expect, type Page } from "@playwright/test";
import { installMock, sampleGames, sampleGuides } from "./libraryMock";

const rows = (page: Page) =>
  page.getByRole("grid", { name: "Guides" }).locator('[role="row"]:not(.gd-heading)');
const row = (page: Page, title: string) =>
  rows(page).filter({ has: page.getByRole("gridcell", { name: title, exact: true }) });
const titles = (page: Page) =>
  rows(page).evaluateAll((els) => els.map((e) => e.querySelectorAll('[role="gridcell"]')[1].textContent));
const calls = (page: Page) => page.evaluate(() => (window as any).guideCalls);
const detail = (page: Page) => page.getByRole("complementary", { name: "Selected guide details" });
const nav = (page: Page) => page.getByRole("navigation", { name: "Primary" });

async function open(page: Page, guides = sampleGuides(), preferences = {}) {
  await installMock(page, { guides, preferences: { collection: "guides", ...preferences } });
  await expect(page.getByRole("heading", { name: "Guides", level: 1 })).toBeVisible();
}

test("guides are listed by title with their game, and the toolbar offers Add Guide", async ({ page }) => {
  await open(page);
  expect(await titles(page)).toEqual([
    "Atlas of Somewhere",
    "Game 05 Official Guide",
    "Game 05 World Map",
    "Game 12 Strategy Guide",
  ]);
  await expect(row(page, "Game 05 Official Guide").getByRole("gridcell").nth(2)).toHaveText("Game 05");
  // A guide for a game that is not in the Library shows the typed name, in muted text.
  await expect(row(page, "Atlas of Somewhere").getByRole("gridcell").nth(2)).toHaveText("Somewhere Quest");
  await expect(row(page, "Atlas of Somewhere").getByRole("gridcell").nth(3)).toHaveText("-");
  await expect(row(page, "Game 05 Official Guide").getByRole("gridcell").nth(5)).toHaveText("$19.99");
  await expect(page.getByRole("status")).toHaveText("4 guides");
  await expect(nav(page).getByRole("button", { name: "Add Guide" })).toBeVisible();
  for (const name of ["Backlog", "Reports"])
    await expect(nav(page).getByRole("button", { name, exact: true })).toHaveCount(0);
});

test("search, platform and link filters narrow the list", async ({ page }) => {
  await open(page);
  await page.getByLabel("Search guides").fill("prima");
  expect(await titles(page)).toEqual(["Game 05 Official Guide"]);
  await page.getByLabel("Search guides").fill("somewhere quest");
  expect(await titles(page)).toEqual(["Atlas of Somewhere"]);
  await page.getByLabel("Search guides").fill("");
  await page.getByLabel("Game link").selectOption("unlinked");
  expect(await titles(page)).toEqual(["Atlas of Somewhere"]);
  await page.getByLabel("Game link").selectOption("linked");
  expect((await titles(page)).length).toBe(3);
  await page.getByLabel("Platform").selectOption({ label: "PlayStation 4" });
  expect(await titles(page)).toEqual(["Game 12 Strategy Guide"]);
  await expect(page.getByRole("status")).toHaveText("1 of 4 guides");
  await page.getByLabel("Search guides").fill("zzz");
  await expect(page.getByText("No guides match the current search and filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear All Filters" }).click();
  expect((await titles(page)).length).toBe(4);
});

test("platform choices list only platforms that have guides", async ({ page }) => {
  await open(page);
  const options = await page.getByLabel("Platform").locator("option").allTextContents();
  expect(options).toEqual(["All platforms", "PC", "PlayStation 4", "Super Nintendo"]);
});

test("arrow keys move the selection and the detail panel follows", async ({ page }) => {
  await open(page);
  await row(page, "Atlas of Somewhere").click();
  await page.keyboard.press("ArrowDown");
  await expect(row(page, "Game 05 Official Guide")).toHaveAttribute("aria-selected", "true");
  await expect(detail(page).getByRole("heading", { name: "Game 05 Official Guide" })).toBeVisible();
  await page.keyboard.press("End");
  await expect(row(page, "Game 12 Strategy Guide")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(row(page, "Atlas of Somewhere")).toHaveAttribute("aria-selected", "true");
});

test("the detail panel shows the guide and links to its game", async ({ page }) => {
  await open(page);
  await row(page, "Game 05 Official Guide").click();
  const panel = detail(page);
  await expect(panel).toContainText("Prima");
  await expect(panel).toContainText("J. Smith");
  await expect(panel).toContainText("$19.99");
  await expect(panel).toContainText("Good");
  await panel.getByRole("button", { name: "Game 05" }).click();
  // Jumps to the Games collection with that game selected and in view.
  await expect(page.locator(".library-view .game-card.selected")).toContainText("Game 05");
  await expect(page.getByRole("complementary", { name: "Selected game details" })).toContainText("Game 05");
  await expect(nav(page).getByRole("button", { name: /^Collection:/ })).toHaveAccessibleName("Collection: Games");
});

test("a game with guides shows a book mark, lists them, and jumps to them", async ({ page }) => {
  await installMock(page, { guides: sampleGuides() });
  await expect(page.locator(".game-card", { hasText: "Game 05" }).getByLabel("Has a guide")).toBeVisible();
  await expect(page.locator(".game-card", { hasText: "Game 06" }).getByLabel("Has a guide")).toHaveCount(0);
  // Exactly the two games with linked guides (the unlinked guide marks nothing).
  await expect(page.getByLabel("Has a guide")).toHaveCount(2);
  await page.locator(".game-card", { hasText: "Game 05" }).click();
  const panel = page.getByRole("complementary", { name: "Selected game details" });
  await expect(panel.getByRole("heading", { name: "Guides (2)" })).toBeVisible();
  await panel.getByRole("button", { name: "Game 05 World Map" }).click();
  await expect(page.getByRole("heading", { name: "Guides", level: 1 })).toBeVisible();
  await expect(row(page, "Game 05 World Map")).toHaveAttribute("aria-selected", "true");
});

test("the book mark also appears in the list view", async ({ page }) => {
  await installMock(page, { guides: sampleGuides(), preferences: { library_view: "list" } });
  await expect(page.getByLabel("Has a guide")).toHaveCount(2);
  await expect(
    page.locator(".list-row", { hasText: "Game 12" }).getByLabel("Has a guide"),
  ).toBeVisible();
});

test("Add guide from a game starts linked to it with its platform", async ({ page }) => {
  await installMock(page, { guides: [] });
  await page.locator(".game-card", { hasText: "Game 07" }).click();
  const panel = page.getByRole("complementary", { name: "Selected game details" });
  await expect(panel.getByRole("heading", { name: "Guides (0)" })).toBeVisible();
  await panel.getByRole("button", { name: "Add guide" }).click();
  await expect(page.getByRole("heading", { name: "Add Guide" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Game \(from your Library\)/ })).toHaveValue("Game 07");
  await page.getByRole("textbox", { name: /^Title/ }).fill("Game 07 Hints");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(row(page, "Game 07 Hints")).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "Game 07 Hints")).toHaveClass(/just-edited/);
  const saved = (await calls(page)).find((c: any[]) => c[0] === "save");
  expect(saved[2]).toMatchObject({ title: "Game 07 Hints", game_id: 7, has_physical: true });
});

test("adding a guide: choose a game by typing, or name one that is not in the Library", async ({ page }) => {
  await open(page);
  await nav(page).getByRole("button", { name: "Add Guide" }).click();
  await page.getByRole("textbox", { name: /^Title/ }).fill("Typed Guide");
  const box = page.getByRole("combobox", { name: /Game \(from your Library\)/ });
  await box.click();
  await box.pressSequentially("Game 3");
  await page.getByRole("option", { name: /Game 31/ }).click();
  await expect(box).toHaveValue("Game 31");
  // Choosing a game fills the platform from it and hides the typed-name box.
  await expect(page.getByLabel("Or the game's name")).toHaveCount(0);
  await page.getByLabel("Pages").fill("320");
  await page.getByLabel("Price paid").fill("12.5");
  await page.getByRole("button", { name: "Save" }).click();
  const first = (await calls(page)).find((c: any[]) => c[0] === "save");
  expect(first[2]).toMatchObject({ title: "Typed Guide", game_id: 31, page_count: 320, purchase_price_cents: 1250 });
  expect(first[2].platform_id).not.toBeNull();

  await nav(page).getByRole("button", { name: "Add Guide" }).click();
  await page.getByRole("textbox", { name: /^Title/ }).fill("Unowned");
  await page.getByLabel("Or the game's name").fill("Some Other Game");
  await page.getByRole("button", { name: "Save" }).click();
  const second = (await calls(page)).filter((c: any[]) => c[0] === "save")[1];
  expect(second[2]).toMatchObject({ game_id: null, game_title: "Some Other Game" });
});

test("typing over a chosen game unlinks it", async ({ page }) => {
  await open(page);
  await row(page, "Game 05 Official Guide").click();
  await page.getByRole("button", { name: "Edit" }).click();
  const box = page.getByRole("combobox", { name: /Game \(from your Library\)/ });
  await expect(box).toHaveValue("Game 05");
  await box.fill("Something else");
  await expect(page.getByLabel("Or the game's name")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  const saved = (await calls(page)).find((c: any[]) => c[0] === "save");
  expect(saved[2].game_id).toBeNull();
});

test("bad numbers are refused before saving", async ({ page }) => {
  await open(page);
  await nav(page).getByRole("button", { name: "Add Guide" }).click();
  await page.getByRole("textbox", { name: /^Title/ }).fill("T");
  await page.getByLabel("Price paid").fill("abc");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter a price like 19.99.");
  await page.getByLabel("Price paid").fill("");
  await page.getByLabel("Pages").fill("1.5");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter the page count as a whole number.");
  expect(await calls(page)).toEqual([]);
});

test("Edit saves changes and Cancel leaves the guide alone", async ({ page }) => {
  await open(page);
  await row(page, "Game 05 World Map").click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit Guide" })).toBeVisible();
  await page.getByRole("textbox", { name: /^Title/ }).fill("Renamed");
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(await titles(page)).toContain("Game 05 World Map");
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("textbox", { name: /^Title/ }).fill("Game 05 Big Map");
  await page.getByRole("button", { name: "Save" }).click();
  expect(await titles(page)).toContain("Game 05 Big Map");
  await expect(row(page, "Game 05 Big Map")).toHaveClass(/just-edited/);
});

test("deleting a guide removes it and selects its neighbour", async ({ page }) => {
  await open(page);
  await row(page, "Game 05 Official Guide").click();
  await page.getByRole("button", { name: "Delete guide" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  expect(await calls(page)).toContainEqual(["delete", 1]);
  expect(await titles(page)).not.toContain("Game 05 Official Guide");
  await expect(row(page, "Game 05 World Map")).toHaveAttribute("aria-selected", "true");
});

test("an empty collection offers to add a guide", async ({ page }) => {
  await open(page, []);
  await expect(page.getByRole("heading", { name: "No guides yet" })).toBeVisible();
  await page.getByRole("button", { name: "Add Guide" }).last().click();
  await expect(page.getByRole("heading", { name: "Add Guide" })).toBeVisible();
});

test("returning from the editor keeps the scroll position", async ({ page }) => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    ...sampleGuides()[0],
    id: 100 + i,
    title: `Guide ${String(i).padStart(2, "0")}`,
    game_id: null,
    game_title: null,
  }));
  await open(page, many);
  const pane = page.locator(".library-pane");
  await row(page, "Guide 45").scrollIntoViewIfNeeded();
  await page.waitForTimeout(50);
  const before = await pane.evaluate((e) => e.scrollTop);
  expect(before).toBeGreaterThan(300);
  await row(page, "Guide 45").click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(Math.abs((await pane.evaluate((e) => e.scrollTop)) - before)).toBeLessThanOrEqual(2);
});

test("a game with no guides shows no book mark and an empty guides section", async ({ page }) => {
  await installMock(page, { games: sampleGames(), guides: [] });
  await expect(page.getByLabel("Has a guide")).toHaveCount(0);
});
