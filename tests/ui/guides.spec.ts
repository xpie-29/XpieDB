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
  // Money and page counts are no longer shown for guides.
  await expect(page.getByRole("columnheader", { name: "Paid" })).toHaveCount(0);
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
  await expect(panel).toContainText("Good");
  await panel.getByRole("button", { name: "Game 05", exact: true }).click();
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
  await page.getByRole("button", { name: "Save", exact: true }).click();
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
  for (const gone of ["Pages", "Purchase date", "Price paid", "Bought from"])
    await expect(page.getByLabel(gone)).toHaveCount(0);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const first = (await calls(page)).find((c: any[]) => c[0] === "save");
  expect(first[2]).toMatchObject({ title: "Typed Guide", game_id: 31 });
  expect(first[2].platform_id).not.toBeNull();

  await nav(page).getByRole("button", { name: "Add Guide" }).click();
  await page.getByRole("textbox", { name: /^Title/ }).fill("Unowned");
  await page.getByLabel("Or the game's name").fill("Some Other Game");
  await page.getByRole("button", { name: "Save", exact: true }).click();
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
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = (await calls(page)).find((c: any[]) => c[0] === "save");
  expect(saved[2].game_id).toBeNull();
});

test("Add Guide can save and then attach a file, or save and look on the Internet Archive", async ({ page }) => {
  await open(page);
  await nav(page).getByRole("button", { name: "Add Guide" }).click();
  const attach = page.getByRole("button", { name: "Save and attach PDF or ePub" });
  const find = page.getByRole("button", { name: "Save and find on Internet Archive" });
  // A title is needed first, since the guide is saved before the file is chosen.
  await expect(attach).toBeDisabled();
  await expect(find).toBeDisabled();
  await page.getByRole("textbox", { name: /^Title/ }).fill("Fresh Guide");
  await page.getByLabel("Or the game's name").fill("Some Other Game");
  await attach.click();
  await expect(row(page, "Fresh Guide")).toBeVisible();
  const saved = (await calls(page)).filter((c: any[]) => c[0] === "save");
  expect(saved).toHaveLength(1);
  const files = await page.evaluate(() => (window as any).guideFileCalls);
  expect(files).toHaveLength(1);
  expect(files[0][0]).toBe("attach");
  await expect(detail(page).getByText("Attached.pdf")).toBeVisible();

  await nav(page).getByRole("button", { name: "Add Guide" }).click();
  await page.getByRole("textbox", { name: /^Title/ }).fill("Second Guide");
  await page.getByLabel("Or the game's name").fill("Another Game");
  await find.click();
  await expect(page.getByRole("dialog", { name: "Find on the Internet Archive" })).toBeVisible();
  await expect(page.getByLabel("Search the Internet Archive")).toHaveValue("Another Game");
  expect((await calls(page)).filter((c: any[]) => c[0] === "save")).toHaveLength(2);
});

test("editing a guide offers no save-and-attach buttons", async ({ page }) => {
  await open(page);
  await row(page, "Game 05 World Map").click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: /^Save and / })).toHaveCount(0);
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
  await page.getByRole("button", { name: "Save", exact: true }).click();
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

const fileCalls = (page: Page) => page.evaluate(() => (window as any).guideFileCalls);
const section = (page: Page) => detail(page).getByRole("region", { name: "Digital copies" });

test("the Copy column says Physical, Digital, Both or nothing", async ({ page }) => {
  const guides = [
    ...sampleGuides(),
    { ...sampleGuides()[3], id: 5, title: "Digital Only Guide", has_physical: false, files: [{ id: 9, guide_id: 5, file_name: "Only.pdf", kind: "pdf", size_bytes: 500, source_url: null, date_added: "x", missing: false }] },
  ];
  await open(page, guides);
  const copy = (title: string) => row(page, title).getByRole("gridcell").nth(3);
  await expect(copy("Game 05 Official Guide")).toHaveText("Both");
  await expect(copy("Game 05 World Map")).toHaveText("Physical");
  await expect(copy("Digital Only Guide")).toHaveText("Digital");
  await expect(copy("Atlas of Somewhere")).toHaveText("-");
});

test("the guide panel lists digital copies with their type and size, and flags a missing one", async ({ page }) => {
  await open(page);
  await row(page, "Game 05 Official Guide").click();
  await expect(section(page).getByRole("heading", { name: "Digital copies (2)" })).toBeVisible();
  await expect(section(page)).toContainText("Game 05 Guide.pdf");
  await expect(section(page)).toContainText("PDF · 12.4 MB");
  await expect(section(page)).toContainText("ePub · 2.3 MB");
  await expect(section(page).getByRole("alert")).toContainText("no longer in the app");
  // The missing copy cannot be opened or shown, but can be removed.
  await expect(section(page).getByRole("button", { name: "Open" }).nth(1)).toBeDisabled();
  await expect(section(page).getByRole("button", { name: "Show Game 05 Guide.epub in folder" })).toBeDisabled();
  await expect(section(page).getByRole("button", { name: "Remove Game 05 Guide.epub" })).toBeEnabled();
  await row(page, "Game 05 World Map").click();
  await expect(section(page).getByRole("heading", { name: "Digital copies (0)" })).toBeVisible();
  await expect(section(page)).toContainText("No digital copy");
});

test("Open and Show in folder act on the chosen file by id", async ({ page }) => {
  await open(page);
  await row(page, "Game 05 Official Guide").click();
  await section(page).getByRole("button", { name: "Open" }).first().click();
  await section(page).getByRole("button", { name: "Show Game 05 Guide.pdf in folder" }).click();
  expect(await fileCalls(page)).toEqual([["open", 1], ["reveal", 1]]);
});

test("Attach adds a file to the guide, a cancelled dialog changes nothing, and a refusal is shown", async ({ page }) => {
  await open(page);
  await row(page, "Game 05 World Map").click();
  await page.evaluate(() => ((window as any).attachResult = "cancel"));
  await section(page).getByRole("button", { name: "Attach PDF or ePub" }).click();
  await expect(section(page).getByRole("heading", { name: "Digital copies (0)" })).toBeVisible();
  await page.evaluate(() => ((window as any).attachResult = "error"));
  await section(page).getByRole("button", { name: "Attach PDF or ePub" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose a PDF or ePub file." })).toBeVisible();
  await page.evaluate(() => ((window as any).attachResult = "file"));
  await section(page).getByRole("button", { name: "Attach PDF or ePub" }).click();
  await expect(section(page).getByRole("heading", { name: "Digital copies (1)" })).toBeVisible();
  await expect(section(page)).toContainText("Attached.pdf");
  await expect(section(page)).toContainText("PDF · 1.0 MB");
  // The list now shows the guide as having a digital copy as well.
  await expect(row(page, "Game 05 World Map").getByRole("gridcell").nth(3)).toHaveText("Both");
  expect((await fileCalls(page)).filter((c: any[]) => c[0] === "attach")).toEqual([["attach", 2], ["attach", 2], ["attach", 2]]);
});

test("Remove asks first, deletes only the chosen file, and Cancel keeps it", async ({ page }) => {
  await open(page);
  await row(page, "Game 05 Official Guide").click();
  await section(page).getByRole("button", { name: "Remove Game 05 Guide.pdf" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("your original file is not touched");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(await fileCalls(page)).toEqual([]);
  await section(page).getByRole("button", { name: "Remove Game 05 Guide.pdf" }).click();
  await dialog.getByRole("button", { name: "Remove" }).click();
  expect(await fileCalls(page)).toEqual([["remove", 1]]);
  await expect(section(page).getByRole("heading", { name: "Digital copies (1)" })).toBeVisible();
  await expect(section(page)).not.toContainText("Game 05 Guide.pdf");
});
