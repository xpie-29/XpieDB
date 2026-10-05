import { test, expect, type Page } from "@playwright/test";
import { installMock } from "./libraryMock";

// Mock platforms: PC, PlayStation 4, Nintendo Switch, Xbox 360 and others flagged built-in.
// "Game Boy Advance" is not one of the 20 bundled platforms, so it must fall back to text.
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

test("the icon follows the text colour so it reads in light and dark themes", async ({
  page,
}) => {
  await installMock(page, { preferences: { library_view: "list" } });
  const glyph = rowFor(page, "PC").first().locator(".glyph");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const [background, text] = await glyph.evaluate((el) => [
      getComputedStyle(el).backgroundColor,
      getComputedStyle(el.parentElement!.parentElement!).color,
    ]);
    expect(background).toBe(text);
    expect(background).not.toBe("rgba(0, 0, 0, 0)");
  }
});
