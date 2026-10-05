import { test, expect, type Page } from "@playwright/test";
import { installMock, sampleGuides } from "./libraryMock";

const calls = (page: Page) => page.evaluate(() => (window as any).archiveCalls);
const dialog = (page: Page) => page.getByRole("dialog", { name: "Find on the Internet Archive" });
const setMode = (page: Page, mode: string) => page.evaluate((m) => ((window as any).archiveMode = m), mode);

async function fromGame(page: Page, game = "Game 05") {
  await installMock(page, { guides: sampleGuides() });
  await page.locator(".game-card", { hasText: game }).click();
  await page.getByRole("button", { name: "Find guides online" }).click();
  await expect(dialog(page)).toBeVisible();
}
async function fromGuide(page: Page, title = "Game 05 World Map") {
  await installMock(page, { guides: sampleGuides(), preferences: { collection: "guides" } });
  await page.getByRole("grid", { name: "Guides" }).getByRole("gridcell", { name: title, exact: true }).click();
  await page.getByRole("button", { name: "Find on Internet Archive" }).click();
  await expect(dialog(page)).toBeVisible();
}
const search = async (page: Page) => {
  await dialog(page).getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog(page).getByRole("list", { name: "Matches" })).toBeVisible();
};

test("from a game, the search starts with the game's title and lists ranked matches with badges", async ({ page }) => {
  await fromGame(page);
  await expect(dialog(page).getByLabel("Search the Internet Archive")).toHaveValue("Game 05");
  await search(page);
  expect(await calls(page)).toEqual([["search", "Game 05"]]);
  const hits = dialog(page).getByRole("list", { name: "Matches" }).getByRole("listitem");
  await expect(hits).toHaveCount(4);
  await expect(hits.first()).toContainText("Doom 3 Official Strategy Guide");
  await expect(hits.first()).toContainText("BradyGames · 2004");
  await expect(hits.first()).toContainText("PDF");
  await expect(hits.nth(1)).toContainText("Borrow only");
  await expect(hits.nth(2)).toContainText("ePub");
  // The edited words are what gets searched.
  await dialog(page).getByLabel("Search the Internet Archive").fill("doom three");
  await dialog(page).getByLabel("Search the Internet Archive").press("Enter");
  await expect(async () => expect((await calls(page)).filter((c: any[]) => c[0] === "search").length).toBe(2)).toPass();
});

test("choosing a match lists its files, recommends the searchable one, and disables an oversized one", async ({ page }) => {
  await fromGame(page);
  await search(page);
  await dialog(page).getByRole("button", { name: /Doom 3 Official Strategy Guide/ }).click();
  const files = dialog(page).getByRole("radiogroup", { name: "File to download" });
  await expect(files.getByRole("radio")).toHaveCount(3);
  await expect(files.getByRole("radio", { name: /doom3\.pdf/ })).toBeChecked();
  await expect(files.getByRole("radio", { name: /doom3\.pdf/ })).toHaveAccessibleName(/Searchable text · 12\.3 MB · recommended/);
  await expect(files.getByRole("radio", { name: /Scanned pages · 85\.8 MB/ })).toBeEnabled();
  await expect(files.getByRole("radio", { name: /too large/ })).toBeDisabled();
  await expect(dialog(page).getByRole("button", { name: "Download (12.3 MB) and attach" })).toBeVisible();
});

test("downloading for a game creates a new guide linked to it and jumps to that guide", async ({ page }) => {
  await fromGame(page);
  await search(page);
  await dialog(page).getByRole("button", { name: /Doom 3 Official Strategy Guide/ }).click();
  await expect(dialog(page).getByLabel("Attach to")).toHaveValue("new");
  await expect(dialog(page).getByLabel("New guide title")).toHaveValue("Doom 3 Official Strategy Guide");
  await dialog(page).getByLabel("New guide title").fill("Game 05 Hints (Archive)");
  await dialog(page).getByRole("button", { name: /Download .* and attach/ }).click();
  // Lands on the Guides collection with the new guide selected and its file listed.
  await expect(page.getByRole("heading", { name: "Guides", level: 1 })).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  const row = page.getByRole("row", { name: /Game 05 Hints \(Archive\)/ });
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(row.getByRole("gridcell").nth(3)).toHaveText("Digital");
  await expect(page.getByRole("complementary", { name: "Selected guide details" })).toContainText("doom3.pdf");
  const download = (await calls(page)).find((c: any[]) => c[0] === "download")[1];
  expect(download).toMatchObject({
    identifier: "doom-3-official-strategy-guide",
    file_name: "doom3.pdf",
    guide_id: null,
    new_guide: { title: "Game 05 Hints (Archive)", game_id: 5, author: "BradyGames", has_physical: false },
  });
});

test("a game's existing guide can be chosen instead of making a new one", async ({ page }) => {
  await fromGame(page);
  await search(page);
  await dialog(page).getByRole("button", { name: /Doom 3 Companion/ }).click();
  const options = await dialog(page).getByLabel("Attach to").locator("option").allTextContents();
  expect(options).toEqual(["A new guide", "Game 05 Official Guide", "Game 05 World Map"]);
  await dialog(page).getByLabel("Attach to").selectOption({ label: "Game 05 World Map" });
  await expect(dialog(page).getByLabel("New guide title")).toHaveCount(0);
  await dialog(page).getByRole("button", { name: /Download .* and attach/ }).click();
  await expect(page.getByRole("row", { name: /Game 05 World Map/ })).toHaveAttribute("aria-selected", "true");
  const download = (await calls(page)).find((c: any[]) => c[0] === "download")[1];
  expect(download).toMatchObject({ file_name: "companion.epub", guide_id: 2, new_guide: null });
});

test("from a guide the file is attached to that guide, with no choice of target", async ({ page }) => {
  await fromGuide(page);
  await expect(dialog(page).getByLabel("Search the Internet Archive")).toHaveValue("Game 05");
  await search(page);
  await dialog(page).getByRole("button", { name: /Doom 3 Official Strategy Guide/ }).click();
  await expect(dialog(page).getByLabel("Attach to")).toHaveCount(0);
  await dialog(page).getByRole("button", { name: /Download .* and attach/ }).click();
  await expect(dialog(page)).toHaveCount(0);
  // Still on Guides, with the file now listed on that guide.
  const panel = page.getByRole("complementary", { name: "Selected guide details" });
  await expect(panel.getByRole("heading", { name: "Game 05 World Map" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Digital copies (1)" })).toBeVisible();
  await expect(panel).toContainText("doom3.pdf");
  const download = (await calls(page)).find((c: any[]) => c[0] === "download")[1];
  expect(download).toMatchObject({ guide_id: 2, new_guide: null });
});

test("a borrow-only item cannot be downloaded, but its archive.org page can be opened", async ({ page }) => {
  await fromGame(page);
  await search(page);
  await dialog(page).getByRole("button", { name: /Doom 3 Prima Guide/ }).click();
  await expect(dialog(page)).toContainText("borrow-only on archive.org");
  await expect(dialog(page).getByRole("button", { name: /Download/ })).toHaveCount(0);
  await dialog(page).getByRole("button", { name: "Open on archive.org" }).click();
  expect(await calls(page)).toContainEqual(["page", "doom3-prima-lending"]);
});

test("an item with no downloadable file says so", async ({ page }) => {
  await fromGame(page);
  await search(page);
  await dialog(page).getByRole("button", { name: /Doom 3 Posters/ }).click();
  await expect(dialog(page)).toContainText("no PDF or ePub file that can be downloaded");
  await expect(dialog(page).getByRole("button", { name: /Download/ })).toHaveCount(0);
});

test("progress is shown while downloading, and Cancel stops it and keeps the dialog usable", async ({ page }) => {
  await fromGame(page);
  await search(page);
  await setMode(page, "slow");
  await dialog(page).getByRole("button", { name: /Doom 3 Official Strategy Guide/ }).click();
  await dialog(page).getByRole("button", { name: /Download .* and attach/ }).click();
  await expect(dialog(page).getByRole("status", { name: "Download progress" })).toContainText("Starting the download");
  await expect(dialog(page).getByRole("button", { name: "Close" })).toHaveCount(0);
  await page.evaluate(() => (window as any).fireTauriEvent("archive-progress", { received: 5_000_000, total: 10_000_000 }));
  await expect(dialog(page).getByRole("status", { name: "Download progress" })).toContainText("4.8 MB of 9.5 MB");
  await expect(dialog(page).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0.5");
  // Nothing can be changed mid-download.
  await expect(dialog(page).getByLabel("Search the Internet Archive")).toBeDisabled();
  await dialog(page).getByRole("button", { name: "Cancel download" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText("Download cancelled.");
  await expect(dialog(page).getByRole("button", { name: /Download .* and attach/ })).toBeVisible();
  await expect(dialog(page).getByLabel("Search the Internet Archive")).toBeEnabled();
  expect(await calls(page)).toContainEqual(["cancel"]);
  // No guide was created.
  await dialog(page).getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".game-card.selected")).toBeVisible();
});

test("a finished slow download completes the same way", async ({ page }) => {
  await fromGuide(page);
  await search(page);
  await setMode(page, "slow");
  await dialog(page).getByRole("button", { name: /Doom 3 Official Strategy Guide/ }).click();
  await dialog(page).getByRole("button", { name: /Download .* and attach/ }).click();
  await page.evaluate(() => (window as any).finishDownload());
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Selected guide details" })).toContainText("doom3.pdf");
});

test("search problems are shown plainly: no matches, a widened search, and an unreachable Archive", async ({ page }) => {
  await fromGame(page);
  await setMode(page, "empty");
  await dialog(page).getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog(page).getByText("No matches.")).toBeVisible();
  await setMode(page, "wide");
  await dialog(page).getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog(page)).toContainText("searches all of each item");
  await setMode(page, "error");
  await dialog(page).getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Unable to reach the Internet Archive");
  await expect(dialog(page).getByRole("list", { name: "Matches" })).toHaveCount(0);
});

test("an empty search is not sent, and closing the dialog changes nothing", async ({ page }) => {
  await fromGame(page);
  await dialog(page).getByLabel("Search the Internet Archive").fill("   ");
  await expect(dialog(page).getByRole("button", { name: "Search", exact: true })).toBeDisabled();
  await dialog(page).getByRole("button", { name: "Close" }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(await calls(page)).toEqual([]);
});
