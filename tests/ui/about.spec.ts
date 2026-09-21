import { test, expect, type Page } from "@playwright/test";
import { installMock } from "./libraryMock";

const REPO = "https://github.com/xpie-29/XpieDB";
// Wait until the app has registered its listener, as it always has by the time a person can click a menu.
const fire = async (page: Page) => {
  await page.waitForFunction(() =>
    (window as any).hasTauriListener("open-about"),
  );
  await page.evaluate(() => (window as any).fireTauriEvent("open-about"));
};
const opened = (page: Page) => page.evaluate(() => (window as any).openedLinks);
const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "About XpieDB" });

test("the Help menu event opens the About dialog with credits and the repository link", async ({
  page,
}) => {
  await installMock(page);
  await expect(dialog(page)).toHaveCount(0);
  await fire(page);
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText(
    "Created by Xpie, ChatGPT, and Claude.",
  );
  await expect(dialog(page)).toContainText("Version 0.1.0");
  await expect(
    dialog(page).getByRole("link", { name: "github.com/xpie-29/XpieDB" }),
  ).toHaveAttribute("href", REPO);
  await expect(dialog(page)).toContainText("IGDB");
});

test("the repository link opens in the default browser and leaves the app in place", async ({
  page,
}) => {
  await installMock(page);
  const before = page.url();
  await fire(page);
  await dialog(page)
    .getByRole("link", { name: /github.com/ })
    .click();
  expect(await opened(page)).toEqual([REPO]);
  expect(page.url()).toBe(before);
  await expect(dialog(page)).toBeVisible();
});

test("the dialog closes with the Close button or Escape", async ({ page }) => {
  await installMock(page);
  await fire(page);
  await dialog(page).getByRole("button", { name: "Close" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await fire(page);
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
});

test("About can be opened from any page and again after closing", async ({
  page,
}) => {
  await installMock(page);
  for (const name of ["Backlog", "Reports", "Settings", "Platforms"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await fire(page);
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole("button", { name: "Close" }).click();
    await expect(dialog(page)).toHaveCount(0);
  }
});

test("other menu events are ignored", async ({ page }) => {
  await installMock(page);
  await page.evaluate(() => (window as any).fireTauriEvent("something-else"));
  await expect(dialog(page)).toHaveCount(0);
});
