import { test, expect, type Page } from "@playwright/test";
import { installMock } from "./libraryMock";

// Mock platforms: PC, PlayStation 4, Nintendo Switch, Xbox 360 and others flagged built-in.
// "Game Boy Advance" is not one of the 20 bundled platforms, so it must fall back to text.
const writes = (page: Page) =>
  page.evaluate(() => (window as any).preferenceWrites);
const rowFor = (page: Page, platform: string) =>
  page.locator(".list-row:not(.list-heading)").filter({
    has: page.locator(`.platform-icon[title="${platform}"]`),
  });

test("built-in platforms show a bundled icon, others fall back to text", async ({
  page,
}) => {
  await installMock(page, { preferences: { library_view: "list" } });
  for (const name of ["PC", "PlayStation 4", "Nintendo Switch", "Xbox 360"]) {
    const icon = rowFor(page, name).first().locator(".platform-icon");
    await expect(icon.getByRole("img", { name })).toBeVisible();
    // The glyph is a real image mask with a size, not an empty box.
    const glyph = icon.locator(".glyph");
    await expect(glyph).toHaveCSS("mask-image", /^url\("data:image\/svg\+xml/);
    expect((await glyph.boundingBox())!.width).toBeGreaterThan(10);
  }
  // Platforms sharing a glyph are told apart by a caption.
  await expect(
    rowFor(page, "Xbox 360").first().locator(".glyph-label"),
  ).toHaveText("360");
  await expect(
    rowFor(page, "PlayStation 4").first().locator(".glyph-label"),
  ).toHaveText("PS4");
  const fallback = rowFor(page, "Game Boy Advance").first().locator(".platform-icon");
  await expect(fallback.locator(".glyph")).toHaveCount(0);
  await expect(fallback).toHaveText("Gam");
});

test("hovering an icon shows the full platform name", async ({ page }) => {
  await installMock(page, { preferences: { library_view: "list" } });
  await expect(
    rowFor(page, "Nintendo Switch").first().locator(".platform-icon"),
  ).toHaveAttribute("title", "Nintendo Switch");
});

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};
const glyphColor = (page: Page, platform: string) =>
  rowFor(page, platform)
    .first()
    .locator(".glyph")
    .evaluate((el) => getComputedStyle(el).backgroundColor);

test("icons are tinted by default, and the setting switches them to mono and back", async ({
  page,
}) => {
  await installMock(page, { preferences: { library_view: "list" } });
  // Tints from the colour chart.
  expect(await glyphColor(page, "PC")).toBe(rgb("#00B7C3"));
  expect(await glyphColor(page, "PlayStation 4")).toBe(rgb("#1450B8"));
  expect(await glyphColor(page, "Nintendo Switch")).toBe(rgb("#E60012"));
  expect(await glyphColor(page, "Xbox 360")).toBe(rgb("#7AC143"));
  // The platform with no bundled icon is unaffected.
  await expect(
    rowFor(page, "Game Boy Advance").first().locator(".glyph"),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Platforms" }).click();
  const toggle = page.getByRole("switch", { name: "Colour the platform icons" });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  expect(await writes(page)).toContainEqual(["platform_icon_style", "mono"]);
  // Mono: the glyph takes the surrounding text colour, as before.
  const mono = await page
    .locator(".platform-row .glyph")
    .first()
    .evaluate((el) => [
      getComputedStyle(el).backgroundColor,
      getComputedStyle(el.parentElement!.parentElement!).color,
    ]);
  expect(mono[0]).toBe(mono[1]);
  await toggle.click();
  expect(await writes(page)).toContainEqual(["platform_icon_style", "color"]);
  expect(
    await page
      .locator(".platform-row .glyph")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe(mono[1]);
});

test("a saved mono preference is honoured at startup, in light and dark themes", async ({
  page,
}) => {
  await installMock(page, {
    preferences: { library_view: "list", platform_icon_style: "mono" },
  });
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const [background, text] = await rowFor(page, "PC")
      .first()
      .locator(".glyph")
      .evaluate((el) => [
        getComputedStyle(el).backgroundColor,
        getComputedStyle(el.parentElement!.parentElement!).color,
      ]);
    expect(background).toBe(text);
    expect(background).not.toBe("rgba(0, 0, 0, 0)");
  }
});
