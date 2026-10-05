import { test, expect, type Page } from "@playwright/test";
import { installMock } from "./libraryMock";

const nav = (page: Page) => page.getByRole("navigation", { name: "Primary" });
const writes = (page: Page) =>
  page.evaluate(() => (window as any).preferenceWrites);
const selector = (page: Page) =>
  nav(page).getByRole("button", { name: /^Collection:/ });

test("the toolbar has one collection selector, not three buttons, and no Platforms button", async ({
  page,
}) => {
  await installMock(page);
  await expect(selector(page)).toHaveAccessibleName("Collection: Games");
  for (const name of ["Library", "Backlog", "Add Game", "Reports", "Settings"])
    await expect(nav(page).getByRole("button", { name, exact: true })).toBeVisible();
  // Guides and Hardware are only listed inside the menu; Platforms moved to Settings.
  for (const name of ["Guides", "Hardware", "Platforms"])
    await expect(nav(page).getByRole("button", { name, exact: true })).toHaveCount(0);
  await selector(page).click();
  await expect(page.getByRole("menuitemradio")).toHaveText([
    "Games",
    "Guides",
    "Hardware",
  ]);
  await expect(page.getByRole("menuitemradio", { name: "Games" })).toBeChecked();
});

test("choosing a collection switches the screen and the toolbar, and is remembered", async ({
  page,
}) => {
  await installMock(page);
  await selector(page).click();
  await page.getByRole("menuitemradio", { name: "Hardware" }).click();
  await expect(selector(page)).toHaveAccessibleName("Collection: Hardware");
  await expect(page.getByRole("heading", { name: "Hardware", level: 1 })).toBeVisible();
  expect(await writes(page)).toContainEqual(["collection", "hardware"]);
  // Games-only buttons are gone; the collection's own buttons appear.
  for (const name of ["Backlog", "Reports"])
    await expect(nav(page).getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(nav(page).getByRole("button", { name: "Add Hardware" })).toBeVisible();
  await expect(page.locator(".library-view:not(.hardware-view)")).toHaveCount(0);

  await selector(page).click();
  await page.getByRole("menuitemradio", { name: "Guides" }).click();
  await expect(page.getByRole("heading", { name: "Guides", level: 1 })).toBeVisible();

  await selector(page).click();
  await page.getByRole("menuitemradio", { name: "Games" }).click();
  await expect(page.locator(".library-view")).toBeVisible();
  await expect(page.locator(".game-card").first()).toBeVisible();
});

test("the saved collection is used at startup", async ({ page }) => {
  await installMock(page, { preferences: { collection: "hardware" } });
  await expect(selector(page)).toHaveAccessibleName("Collection: Hardware");
  await expect(page.getByRole("heading", { name: "Hardware", level: 1 })).toBeVisible();
});

test("an unknown saved collection falls back to Games", async ({ page }) => {
  await installMock(page, { preferences: { collection: "nonsense" } });
  await expect(selector(page)).toHaveAccessibleName("Collection: Games");
  await expect(page.locator(".library-view")).toBeVisible();
});

test("Platforms is reached from Settings and returns there", async ({ page }) => {
  await installMock(page);
  await nav(page).getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Manage platforms" }).click();
  await expect(page.getByRole("heading", { name: "Platforms" })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});
