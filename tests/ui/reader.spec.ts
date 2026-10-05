import { test, expect, type Page } from "@playwright/test";
import { installMock, sampleGuides } from "./libraryMock";
import { buildPdf, guidePdf, guideText, servePdfs } from "./pdfFixture";

const calls = (page: Page) => page.evaluate(() => (window as any).readerCalls);
const writes = (page: Page) => page.evaluate(() => (window as any).preferenceWrites);
const reader = (page: Page) => page.getByRole("region", { name: "Guide reader" });
const bar = (page: Page) => reader(page).getByRole("toolbar", { name: "Reader controls" });
const pageBox = (page: Page) => bar(page).getByRole("textbox", { name: "Page" });
const canvas = (page: Page, n: number) => page.locator(`.pdfViewer .page[data-page-number="${n}"] canvas`);
const pageIs = async (page: Page, n: number) => expect(pageBox(page)).toHaveValue(String(n));

/** The sample guides, with each served file's size set to its real byte count (the reader relies on it). */
function guidesFor(files: Record<number, Buffer>) {
  return sampleGuides().map((g) => ({
    ...g,
    files: g.files.map((f: any) => (files[f.id] ? { ...f, size_bytes: files[f.id].length } : f)),
  }));
}

/** Opens Game 05's guide PDF (file 1; 8 pages) or another file from the Guides collection. */
async function openReader(page: Page, options: { preferences?: Record<string, string>; guide?: string; files?: Record<number, Buffer> } = {}) {
  const files = options.files ?? { 1: guidePdf(), 4: guidePdf() };
  const requests = await servePdfs(page, files);
  await installMock(page, { guides: guidesFor(files), preferences: { collection: "guides", ...options.preferences } });
  await page.getByRole("grid", { name: "Guides" }).getByRole("gridcell", { name: options.guide ?? "Game 05 Official Guide", exact: true }).click();
  await page.getByRole("button", { name: "Read" }).first().click();
  await expect(reader(page)).toBeVisible();
  await expect(bar(page).getByLabel("Page count")).toHaveText("of 8");
  return requests;
}

test("Read opens a PDF in the app's own reader, replacing the main toolbar, and Back returns to the guide", async ({ page }) => {
  await openReader(page);
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  await expect(bar(page)).toContainText("Game 05 Official Guide");
  await expect(bar(page)).toContainText("Game 05 Guide.pdf");
  await pageIs(page, 1);
  // The first page is really drawn, with selectable text on top of it.
  await expect(canvas(page, 1)).toBeVisible();
  await expect(page.locator('.pdfViewer .page[data-page-number="1"] .textLayer')).toContainText("Introduction");
  await bar(page).getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Selected guide details" })).toContainText("Game 05 Official Guide");
});

test("only PDFs that are present get a Read button, and each file keeps its Open button", async ({ page }) => {
  await installMock(page, { guides: sampleGuides(), preferences: { collection: "guides" } });
  await page.getByRole("grid", { name: "Guides" }).getByRole("gridcell", { name: "Game 05 Official Guide", exact: true }).click();
  const files = page.getByRole("region", { name: "Digital copies" });
  // The PDF can be read; the (missing) ePub cannot, and a missing file has nothing to open.
  await expect(files.getByRole("button", { name: "Read" })).toHaveCount(1);
  await expect(files.getByRole("button", { name: "Open", exact: true })).toHaveCount(2);
  await page.getByRole("grid", { name: "Guides" }).getByRole("gridcell", { name: "Game 12 Strategy Guide", exact: true }).click();
  await expect(files).toContainText("Last read: page 3");
});

test("a big file is fetched in byte ranges, not downloaded whole", async ({ page }) => {
  // 6 MB of padding; the server hands out at most 1 MB per request, as the app does (4 MB).
  const big = buildPdf(guideText, [{ title: "Introduction", page: 1 }], 6 * 1024 * 1024);
  const requests = await servePdfs(page, { 1: big }, 1024 * 1024);
  await installMock(page, { guides: guidesFor({ 1: big }), preferences: { collection: "guides" } });
  await page.getByRole("grid", { name: "Guides" }).getByRole("gridcell", { name: "Game 05 Official Guide", exact: true }).click();
  await page.getByRole("button", { name: "Read" }).first().click();
  await expect(bar(page).getByLabel("Page count")).toHaveText("of 8");
  await expect(canvas(page, 1)).toBeVisible();
  expect(requests.length).toBeGreaterThan(1);
  // Every request names exactly the bytes it wants; none asks for the whole file.
  expect(requests.every((r) => r.id === 1 && r.range?.startsWith("bytes=") && r.bytes <= 1024 * 1024)).toBe(true);
  // Reading the first page needs only part of the file.
  expect(requests.reduce((total, r) => total + r.bytes, 0)).toBeLessThan(big.length);
});

test("a file reopens on the page where it was left", async ({ page }) => {
  await openReader(page, { guide: "Game 12 Strategy Guide" });
  await pageIs(page, 3);
  await expect(page.locator('.pdfViewer .page[data-page-number="3"] .textLayer')).toContainText("dragon sword");
});

test("pages can be turned, typed in, and the place is remembered", async ({ page }) => {
  await openReader(page);
  await expect(bar(page).getByRole("button", { name: "Previous page" })).toBeDisabled();
  await bar(page).getByRole("button", { name: "Next page" }).click();
  await pageIs(page, 2);
  await pageBox(page).fill("5");
  await pageBox(page).press("Enter");
  await pageIs(page, 5);
  await expect(page.locator('.pdfViewer .page[data-page-number="5"] .textLayer')).toContainText("dragon king");
  await pageBox(page).fill("99");
  await pageBox(page).press("Enter");
  await pageIs(page, 8);
  await expect(bar(page).getByRole("button", { name: "Next page" })).toBeDisabled();
  // The last place is saved shortly after the reader stops moving.
  await expect.poll(async () => (await calls(page)).filter((c: any[]) => c[0] === "position").pop()).toEqual(["position", 1, 8]);
  // Leaving flushes at once; reopening starts there.
  await bar(page).getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("region", { name: "Digital copies" })).toContainText("Last read: page 8");
  await page.getByRole("button", { name: "Read" }).first().click();
  await pageIs(page, 8);
});

test("zoom can be set, stepped and remembered", async ({ page }) => {
  await openReader(page);
  const zoom = bar(page).getByLabel("Zoom level");
  await expect(zoom).toHaveValue("page-width");
  await zoom.selectOption("2.00");
  await expect(zoom).toHaveValue("2.00");
  await expect.poll(() => writes(page)).toContainEqual(["reader_zoom", "2.00"]);
  await bar(page).getByRole("button", { name: "Zoom out" }).click();
  await expect(zoom).not.toHaveValue("2.00");
  await zoom.selectOption("page-fit");
  await expect.poll(() => writes(page)).toContainEqual(["reader_zoom", "page-fit"]);
});

test("a saved zoom is used when the reader opens", async ({ page }) => {
  await openReader(page, { preferences: { reader_zoom: "1.50" } });
  await expect(bar(page).getByLabel("Zoom level")).toHaveValue("1.50");
});

test("search finds words, steps through matches, reports none, and clears with Escape", async ({ page }) => {
  await openReader(page);
  const box = bar(page).getByRole("textbox", { name: "Search in this guide" });
  await box.fill("dragon");
  await box.press("Enter");
  const result = bar(page).getByRole("status", { name: "Search result" });
  await expect(result).toHaveText("1 of 2");
  await pageIs(page, 3);
  await bar(page).getByRole("button", { name: "Next match" }).click();
  await expect(result).toHaveText("2 of 2");
  await pageIs(page, 5);
  await bar(page).getByRole("button", { name: "Previous match" }).click();
  await expect(result).toHaveText("1 of 2");
  await box.fill("zebra");
  await box.press("Enter");
  await expect(result).toHaveText("1 of 1");
  await pageIs(page, 8);
  await box.fill("qqqq");
  await box.press("Enter");
  await expect(result).toHaveText("Not found");
  await box.press("Escape");
  await expect(box).toHaveValue("");
  await expect(result).toHaveCount(0);
});

test("Ctrl+F jumps to the search box", async ({ page }) => {
  await openReader(page);
  await page.keyboard.press("Control+f");
  await expect(bar(page).getByRole("textbox", { name: "Search in this guide" })).toBeFocused();
});

test("the table of contents lists the PDF's own outline and jumps to a section", async ({ page }) => {
  await openReader(page);
  await bar(page).getByRole("button", { name: "Contents" }).click();
  const panel = reader(page).getByRole("complementary", { name: "Contents" });
  await expect(panel.getByRole("button")).toHaveText(["Introduction", "Weapons", "Bosses"]);
  await panel.getByRole("button", { name: "Bosses" }).click();
  await pageIs(page, 5);
  await panel.getByRole("button", { name: "Weapons" }).click();
  await pageIs(page, 3);
  // Closing the panel gives the page its width back.
  await bar(page).getByRole("button", { name: "Contents" }).click();
  await expect(panel).toHaveCount(0);
});

test("opening or closing a side panel re-fits the page instead of scrolling sideways", async ({ page }) => {
  await openReader(page);
  const sideways = () => page.locator(".reader-scroll").evaluate((e) => e.scrollWidth - e.clientWidth);
  await expect.poll(sideways).toBeLessThanOrEqual(1);
  const widthBefore = await page.locator('.pdfViewer .page[data-page-number="1"]').evaluate((e) => e.getBoundingClientRect().width);
  await bar(page).getByRole("button", { name: "Contents" }).click();
  await expect.poll(sideways).toBeLessThanOrEqual(1);
  // The page got narrower to fit the narrower area.
  await expect.poll(() => page.locator('.pdfViewer .page[data-page-number="1"]').evaluate((e) => e.getBoundingClientRect().width)).toBeLessThan(widthBefore - 100);
  await bar(page).getByRole("button", { name: "Contents" }).click();
  await expect.poll(sideways).toBeLessThanOrEqual(1);
  await expect.poll(() => page.locator('.pdfViewer .page[data-page-number="1"]').evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(widthBefore - 5);
});

test("a PDF with no outline says so", async ({ page }) => {
  await openReader(page, { files: { 1: buildPdf(["a", "b", "c", "d", "e", "f", "g", "h"]) } });
  await bar(page).getByRole("button", { name: "Contents" }).click();
  await expect(reader(page)).toContainText("This guide has no table of contents.");
});

test("bookmarks: add the current page, jump back, rename, remove", async ({ page }) => {
  await openReader(page);
  await bar(page).getByRole("button", { name: "Bookmarks" }).click();
  const panel = reader(page).getByRole("complementary", { name: "Bookmarks" });
  await expect(panel).toContainText("No bookmarks yet");
  const toggle = bar(page).getByRole("button", { name: /bookmark (this page|from this page)/i });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await pageBox(page).fill("3");
  await pageBox(page).press("Enter");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await pageBox(page).fill("5");
  await pageBox(page).press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  const items = panel.getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("Page 3");
  await expect(items.nth(1)).toContainText("Page 5");
  // Jump back to the first.
  await items.nth(0).getByRole("button", { name: /Page 3/ }).click();
  await pageIs(page, 3);
  // Rename by double-clicking.
  await items.nth(0).getByRole("button", { name: /Page 3/ }).dblclick();
  const name = panel.getByRole("textbox", { name: "Name for the bookmark on page 3" });
  await name.fill("Dragon sword stats");
  await name.press("Enter");
  await expect(items.nth(0)).toContainText("Dragon sword stats");
  expect(await calls(page)).toContainEqual(["bookmark-rename", 1, "Dragon sword stats"]);
  // Removing from the panel or with the toolbar button both work.
  await panel.getByRole("button", { name: "Delete the bookmark on page 5" }).click();
  await expect(items).toHaveCount(1);
  await toggle.click();
  await expect(items).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});

test("bookmarks are kept per file and come back when the file is reopened", async ({ page }) => {
  await openReader(page);
  await pageBox(page).fill("4");
  await pageBox(page).press("Enter");
  await bar(page).getByRole("button", { name: "Bookmark this page" }).click();
  await bar(page).getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Read" }).first().click();
  await bar(page).getByRole("button", { name: "Bookmarks" }).click();
  await expect(reader(page).getByRole("complementary", { name: "Bookmarks" })).toContainText("Page 4");
});

test("night mode inverts the pages and is remembered", async ({ page }) => {
  await openReader(page);
  const toggle = bar(page).getByRole("button", { name: "Night mode" });
  await expect(reader(page)).not.toHaveClass(/reader-night/);
  await toggle.click();
  await expect.poll(() => writes(page)).toContainEqual(["reader_night", "true"]);
  await expect(reader(page)).toHaveClass(/reader-night/);
  await expect(page.locator('.pdfViewer .page[data-page-number="1"]')).toHaveCSS("filter", /invert/);
  await toggle.click();
  await expect(reader(page)).not.toHaveClass(/reader-night/);
});

test("a saved night-mode choice applies when the reader opens", async ({ page }) => {
  await openReader(page, { preferences: { reader_night: "true" } });
  await expect(reader(page)).toHaveClass(/reader-night/);
  await expect(bar(page).getByRole("button", { name: "Night mode" })).toHaveAttribute("aria-pressed", "true");
});

test("full screen toggles the window, and leaving the reader leaves full screen", async ({ page }) => {
  await openReader(page);
  await bar(page).getByRole("button", { name: "Full screen" }).click();
  await expect(bar(page).getByRole("button", { name: "Exit full screen" })).toBeVisible();
  expect((await calls(page)).filter((c: any[]) => c[0] === "fullscreen")).toEqual([["fullscreen", true]]);
  await bar(page).getByRole("button", { name: "Back" }).click();
  await expect.poll(async () => (await calls(page)).filter((c: any[]) => c[0] === "fullscreen")).toEqual([["fullscreen", true], ["fullscreen", false]]);
});

test("a reader that never went full screen does not touch the window", async ({ page }) => {
  await openReader(page);
  await bar(page).getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  expect((await calls(page)).filter((c: any[]) => c[0] === "fullscreen")).toEqual([]);
});

test("other guides can be switched to without leaving the reader, each at its own place", async ({ page }) => {
  await openReader(page);
  await bar(page).getByRole("button", { name: "Other guides" }).click();
  const panel = reader(page).getByRole("complementary", { name: "Other guides" });
  // Only guides with a readable PDF are listed, most recently read first.
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await expect(panel.getByRole("listitem").first()).toContainText("Game 12 Strategy Guide");
  await expect(panel.getByRole("button", { name: /Game 05 Guide\.pdf/ })).toHaveAttribute("aria-current", "true");
  await pageBox(page).fill("6");
  await pageBox(page).press("Enter");
  await panel.getByRole("button", { name: /Game 12 Guide\.pdf/ }).click();
  await expect(bar(page)).toContainText("Game 12 Strategy Guide");
  await pageIs(page, 3);
  await expect(panel.getByRole("button", { name: /Game 12 Guide\.pdf/ })).toHaveAttribute("aria-current", "true");
  // The place in the first file was saved when switching away.
  expect(await calls(page)).toContainEqual(["position", 1, 6]);
  await panel.getByRole("button", { name: /Game 05 Guide\.pdf/ }).click();
  await pageIs(page, 6);
  // The list can be filtered by title or game.
  await panel.getByRole("textbox", { name: "Find a guide" }).fill("game 12");
  await expect(panel.getByRole("listitem")).toHaveCount(1);
  await panel.getByRole("textbox", { name: "Find a guide" }).fill("zzz");
  await expect(panel).toContainText("No other guides with a PDF.");
});

test("a damaged file explains itself and offers the default reader", async ({ page }) => {
  await openReader(page, { files: { 1: Buffer.from("this is not a pdf at all") } }).catch(() => {});
  await expect(reader(page).getByRole("alert")).toContainText("doesn't look like a valid PDF");
  await reader(page).getByRole("alert").getByRole("button", { name: "Open in default reader" }).click();
  expect(await calls(page)).toContainEqual(["open_guide_file", 1]);
});

test("a file that has gone missing is reported", async ({ page }) => {
  await openReader(page, { files: {} }).catch(() => {});
  await expect(reader(page).getByRole("alert")).toContainText("no longer in the app's folder");
});
