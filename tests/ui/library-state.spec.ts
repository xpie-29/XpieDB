import { test, expect, type Page } from "@playwright/test";
import { installMock } from "./libraryMock";

const pane = (page: Page) => page.locator(".library-pane");
const scrollTop = (page: Page) => pane(page).evaluate((e) => e.scrollTop);
const writes = (page: Page) =>
  page.evaluate(() => (window as any).preferenceWrites);

async function scrollDown(page: Page, to: string) {
  const target = page.locator(to).first();
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(50);
  return scrollTop(page);
}

for (const mode of ["grid", "list"] as const) {
  const entry = mode === "grid" ? ".game-card" : ".list-row:not(.list-heading)";

  test(`${mode}: Cancel and Save return to the same scroll, sort, filter and view`, async ({
    page,
  }) => {
    await installMock(page, {
      preferences: { library_view: mode, library_sort: "rating_desc" },
    });
    await page.getByLabel("Search games").first().fill("Game");
    const titles = () => page.locator(entry).locator("strong, [title]").first();
    const before = await scrollDown(page, `${entry} >> nth=45`);
    expect(before).toBeGreaterThan(300);
    const firstTitle = await page.locator(entry).first().innerText();
    // Select a game far down and open it for editing.
    await page.locator(entry).nth(45).click();
    await page.getByRole("button", { name: /^Edit/ }).first().click();
    await expect(page.getByRole("heading", { name: "Edit Game" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).first().click();
    await expect(pane(page)).toBeVisible();
    expect(Math.abs((await scrollTop(page)) - before)).toBeLessThanOrEqual(2);
    expect(await page.locator(entry).first().innerText()).toBe(firstTitle);
    await expect(page.getByLabel("Search games").first()).toHaveValue("Game");
    expect(await page.locator(entry).count()).toBe(60);
    void titles;

    // Save a change that moves the game in the sort order (rating): scroll must not jump.
    await page.locator(entry).nth(45).click();
    await page.getByRole("button", { name: /^Edit/ }).first().click();
    await page.getByRole("radio", { name: "5 stars" }).first().click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(pane(page)).toBeVisible();
    expect(Math.abs((await scrollTop(page)) - before)).toBeLessThanOrEqual(2);
    await expect(page.locator(".just-edited")).toHaveCount(1);
    // The highlight fades by itself.
    await expect(page.locator(".just-edited")).toHaveCount(0, {
      timeout: 6000,
    });
  });
}
