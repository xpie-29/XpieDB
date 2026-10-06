import { test, expect, type Page } from "@playwright/test";
import { installMock, sampleGames } from "./libraryMock";

const hideCalls = (page: Page) => page.evaluate(() => (window as any).hideCalls);
const status = (page: Page) => page.getByRole("status").filter({ hasText: /games?$/ });
const cell = (page: Page, title: string) =>
  page.getByRole("gridcell", { name: title, exact: true });
const detail = (page: Page) => page.getByRole("complementary", { name: "Selected game details" });

async function openList(page: Page, options = {}) {
  await installMock(page, { preferences: { library_view: "list" }, ...options });
  await expect(page.getByRole("grid", { name: "Game library" })).toBeVisible();
}

test("hiding a game removes it from the list and the counts, and Undo brings it back", async ({ page }) => {
  await openList(page);
  await expect(status(page)).toHaveText("60 games");
  await cell(page, "Game 05").click();
  await expect(detail(page)).toContainText("Game 05");
  await detail(page).getByRole("button", { name: "Hide from library" }).click();
  await expect(cell(page, "Game 05")).toHaveCount(0);
  await expect(status(page)).toHaveText("59 games");
  expect(await hideCalls(page)).toEqual([[5, true]]);
  const notice = page.locator(".shell-notice");
  await expect(notice).toContainText('"Game 05" is hidden');
  await notice.getByRole("button", { name: "Undo" }).click();
  await expect(cell(page, "Game 05")).toBeVisible();
  await expect(status(page)).toHaveText("60 games");
  await expect(detail(page)).toContainText("Game 05");
  expect(await hideCalls(page)).toEqual([[5, true], [5, false]]);
});

test("hidden games are listed in Settings and can be unhidden several at a time", async ({ page }) => {
  const games = sampleGames().map((g: any) => (g.id === 3 || g.id === 4 || g.id === 6 ? { ...g, hidden: true } : g));
  await openList(page, { games });
  await expect(status(page)).toHaveText("57 games");
  await expect(cell(page, "Game 03")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const section = page.getByRole("region", { name: "Hidden games" });
  await expect(section.getByRole("checkbox")).toHaveCount(3);
  const unhide = section.getByRole("button", { name: /^Unhide selected/ });
  await expect(unhide).toBeDisabled();
  await section.getByRole("checkbox", { name: "Game 03" }).check();
  await section.getByRole("checkbox", { name: "Game 06" }).check();
  await expect(unhide).toHaveText("Unhide selected (2)");
  await unhide.click();
  await expect(section.getByRole("checkbox")).toHaveCount(1);
  await expect(section.getByRole("checkbox", { name: "Game 04" })).toBeVisible();
  expect((await hideCalls(page)).sort()).toEqual([[3, false], [6, false]]);
  await section.getByRole("button", { name: "Select all" }).click();
  await section.getByRole("button", { name: /^Unhide selected/ }).click();
  await expect(section.getByText("No hidden games.")).toBeVisible();
  await page.getByRole("button", { name: "Games", exact: true }).click();
  await expect(status(page)).toHaveText("60 games");
});

test("a hidden Backlog game is left out of the Backlog, and reordering keeps its place", async ({ page }) => {
  // Backlog games are 8, 18, 28, 38, 48, 58 at places 1-6; hide 18.
  const games = sampleGames().map((g: any) => (g.id === 18 ? { ...g, hidden: true } : g));
  await installMock(page, { games });
  await page.getByRole("button", { name: "Backlog", exact: true }).click();
  const rows = page.locator(".backlog-row");
  const ids = async () =>
    (await rows.evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.id)))) as number[];
  expect(await ids()).toEqual([8, 28, 38, 48, 58]);
  expect(await rows.locator(".backlog-number").allTextContents()).toEqual(["1", "2", "3", "4", "5"]);
  await expect(page.getByText("5 games in your order.")).toBeVisible();
  // Move Game 28 to the top: the hidden game must stay in the saved order, in its own place.
  await page.locator('[data-handle="28"]').focus();
  await page.keyboard.press("Home");
  await expect.poll(ids).toEqual([28, 8, 38, 48, 58]);
  const calls = await page.evaluate(() => (window as any).backlogCalls);
  expect(calls.at(-1)[1]).toEqual([28, 18, 8, 38, 48, 58]);
});

test("hidden games do not count in the Statistics ribbon", async ({ page }) => {
  const games = sampleGames().map((g: any) => (g.id <= 10 ? { ...g, hidden: true } : g));
  await installMock(page, { games });
  await expect(page.getByText("50 games", { exact: false }).first()).toBeVisible();
});
