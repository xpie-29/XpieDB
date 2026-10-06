import { test, expect, type Page } from "@playwright/test";
import { installMock } from "./libraryMock";

// Sample Backlog games: Game 08, 18, 28, 38, 48, 58 at places 1-6.
const rows = (page: Page) => page.locator(".backlog-row");
const row = (page: Page, id: number) => page.locator(`.backlog-row[data-id="${id}"]`);
const panel = (page: Page) => page.getByRole("complementary", { name: "Selected game details" });

async function openBacklog(page: Page) {
  await installMock(page);
  await page.getByRole("button", { name: "Backlog", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Backlog", exact: true })).toBeVisible();
}

test("the Backlog shows the details of its first game, and clicking another game updates them", async ({ page }) => {
  await openBacklog(page);
  await expect(panel(page).getByRole("heading", { name: "Game 08" })).toBeVisible();
  await expect(row(page, 8)).toHaveClass(/selected/);
  await page.getByRole("button", { name: "Show details of Game 28" }).click();
  await expect(panel(page).getByRole("heading", { name: "Game 28" })).toBeVisible();
  await expect(row(page, 28)).toHaveClass(/selected/);
  await expect(row(page, 8)).not.toHaveClass(/selected/);
  // The chosen row's border uses the highlight colour; the others keep the plain one.
  const border = (id: number) => row(page, id).evaluate((e) => getComputedStyle(e).borderTopColor);
  expect(await border(28)).not.toBe(await border(18));
  await expect(panel(page)).toContainText("Backlog position");
  await expect(panel(page)).toContainText("#3");
});

test("the Backlog opens on the game selected in the Library when that game is in the backlog", async ({ page }) => {
  await installMock(page, { preferences: { library_view: "list" } });
  await page.getByRole("gridcell", { name: "Game 38", exact: true }).click();
  await page.getByRole("button", { name: "Backlog", exact: true }).click();
  await expect(panel(page).getByRole("heading", { name: "Game 38" })).toBeVisible();
  await expect(row(page, 38)).toHaveClass(/selected/);
});

test("a game that is not in the backlog is not shown there; the first backlog game is", async ({ page }) => {
  await installMock(page, { preferences: { library_view: "list" } });
  await page.getByRole("gridcell", { name: "Game 02", exact: true }).click();
  await page.getByRole("button", { name: "Backlog", exact: true }).click();
  await expect(panel(page).getByRole("heading", { name: "Game 08" })).toBeVisible();
});

test("Edit from the Backlog panel returns to the Backlog", async ({ page }) => {
  await openBacklog(page);
  await page.getByRole("button", { name: "Show details of Game 18" }).click();
  await panel(page).getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit Game" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Title/ })).toHaveValue("Game 18");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Backlog", exact: true })).toBeVisible();
  await expect(panel(page).getByRole("heading", { name: "Game 18" })).toBeVisible();
});

test("hiding the selected game in the Backlog selects its neighbour, and Delete does too", async ({ page }) => {
  await openBacklog(page);
  await page.getByRole("button", { name: "Show details of Game 18" }).click();
  await panel(page).getByRole("button", { name: "Hide from library" }).click();
  await expect(rows(page)).toHaveCount(5);
  await expect(panel(page).getByRole("heading", { name: "Game 28" })).toBeVisible();
  await expect(row(page, 28)).toHaveClass(/selected/);
  await panel(page).getByRole("button", { name: "Delete game" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(rows(page)).toHaveCount(4);
  await expect(panel(page).getByRole("heading", { name: "Game 38" })).toBeVisible();
});

test("reordering still works with the panel open and keeps the selection", async ({ page }) => {
  await openBacklog(page);
  await page.getByRole("button", { name: "Show details of Game 28" }).click();
  await page.locator('[data-handle="28"]').focus();
  await page.keyboard.press("Home");
  await expect(rows(page).first()).toHaveAttribute("data-id", "28");
  await expect(panel(page).getByRole("heading", { name: "Game 28" })).toBeVisible();
  await expect(panel(page)).toContainText("#1");
});

test("an empty backlog shows no panel", async ({ page }) => {
  await installMock(page, { games: [] });
  await page.getByRole("button", { name: "Backlog", exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
});
