import { test, expect, type Page } from "@playwright/test";
import { installMock, sampleGames } from "./libraryMock";

// A 1x1 transparent PNG, so the pictures "load".
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const calls = (page: Page) => page.evaluate(() => (window as any).panelCalls);
const panel = (page: Page) => page.getByRole("complementary", { name: "Selected game details" });
const backdrop = (page: Page) => panel(page).locator(".detail-backdrop");
const picker = (page: Page) => page.locator(".panel-picker");

async function open(page: Page, tweak: (g: any) => any = (g) => g, extra: Record<string, unknown> = {}) {
  const games = sampleGames().map((g: any) => (g.id === 1 ? tweak({ ...g }) : g));
  await installMock(page, { games });
  await page.addInitScript(
    ({ png, extra }) => {
      Object.assign(window as any, { imageData: png }, extra);
    },
    { png: PNG, extra },
  );
  await page.reload();
  await expect(panel(page)).toBeVisible();
}

test("the panel starts on the default gray with no picture", async ({ page }) => {
  await open(page);
  await expect(backdrop(page)).toHaveCount(0);
});

test("Cover art backs the panel with a faded, desaturated copy of the cover", async ({ page }) => {
  await open(page, (g) => ({ ...g, cover_path: "covers/one.png" }));
  await panel(page).getByRole("button", { name: "Panel background" }).click();
  await picker(page).getByRole("radio", { name: "Cover art" }).check();
  await expect(backdrop(page)).toHaveCount(1);
  await expect(backdrop(page)).toHaveClass(/desaturated/);
  const style = await backdrop(page).evaluate((e) => {
    const s = getComputedStyle(e);
    return { opacity: s.opacity, filter: s.filter, size: s.backgroundSize };
  });
  expect(style.opacity).toBe("0.4");
  expect(style.filter).toContain("grayscale");
  expect(style.size).toBe("cover");
  expect((await calls(page)).at(-1)).toEqual(["set", 1, { mode: "cover", image: null, fit: "fill" }]);
  // Back to Default gray.
  await picker(page).getByRole("radio", { name: "Default gray" }).check();
  await expect(backdrop(page)).toHaveCount(0);
});

test("Cover art is unavailable for a game with no cover", async ({ page }) => {
  await open(page);
  await panel(page).getByRole("button", { name: "Panel background" }).click();
  await expect(picker(page).getByRole("radio", { name: "Cover art" })).toBeDisabled();
});

test("Your own image asks for a picture first, and a cancelled dialog changes nothing", async ({ page }) => {
  await open(page);
  await panel(page).getByRole("button", { name: "Panel background" }).click();
  await picker(page).getByRole("radio", { name: "Your own image" }).click();
  expect(await calls(page)).toEqual([["select", "covers"]]);
  await expect(backdrop(page)).toHaveCount(0);
  await expect(picker(page).getByRole("radio", { name: "Default gray" })).toBeChecked();
});

test("a chosen image is placed as filled, fitted, stretched, centered or tiled, and remembered", async ({ page }) => {
  await open(page, (g) => g, { selectedImage: "covers/mine.png" });
  await panel(page).getByRole("button", { name: "Panel background" }).click();
  await picker(page).getByRole("radio", { name: "Your own image" }).check();
  await expect(backdrop(page)).toHaveCount(1);
  expect((await calls(page)).at(-1)).toEqual(["set", 1, { mode: "image", image: "covers/mine.png", fit: "fill" }]);
  const look = () =>
    backdrop(page).evaluate((e) => {
      const s = getComputedStyle(e);
      return [s.backgroundSize, s.backgroundRepeat, s.filter];
    });
  expect(await look()).toEqual(["cover", "no-repeat", "none"]);
  const select = picker(page).getByLabel("Placement");
  await select.selectOption("fit");
  expect(await look()).toEqual(["contain", "no-repeat", "none"]);
  await select.selectOption("stretch");
  expect((await look())[0]).toBe("100% 100%");
  await select.selectOption("center");
  expect(await look()).toEqual(["auto", "no-repeat", "none"]);
  await select.selectOption("tile");
  expect(await look()).toEqual(["auto", "repeat", "none"]);
  expect((await calls(page)).at(-1)[2]).toEqual({ mode: "image", image: "covers/mine.png", fit: "tile" });
  // Switching away keeps the image, and switching back needs no new dialog.
  await picker(page).getByRole("radio", { name: "Default gray" }).check();
  await expect(backdrop(page)).toHaveCount(0);
  const before = (await calls(page)).filter((c: any[]) => c[0] === "select").length;
  await picker(page).getByRole("radio", { name: "Your own image" }).check();
  await expect(backdrop(page)).toHaveCount(1);
  expect((await calls(page)).filter((c: any[]) => c[0] === "select").length).toBe(before);
});

test("the choice belongs to one game; another game keeps the default", async ({ page }) => {
  await open(page, (g) => ({ ...g, panel: { mode: "image", image: "covers/mine.png", fit: "tile" } }));
  await expect(backdrop(page)).toHaveCount(1);
  await page.getByRole("button", { name: /Game 02/ }).first().click();
  await expect(backdrop(page)).toHaveCount(0);
});

test("a refused change is explained and the discarded image is cleaned up", async ({ page }) => {
  await open(page, (g) => g, { selectedImage: "covers/mine.png", panelFail: "The library could not be updated." });
  await panel(page).getByRole("button", { name: "Panel background" }).click();
  await picker(page).getByRole("radio", { name: "Your own image" }).click();
  await expect(page.getByRole("alert")).toContainText("The library could not be updated.");
  await expect(backdrop(page)).toHaveCount(0);
  // The image imported for the refused change is thrown away again.
  await expect.poll(async () => (await calls(page)).at(-1)).toEqual(["discard", "covers/mine.png"]);
});
