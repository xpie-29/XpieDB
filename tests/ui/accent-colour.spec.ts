import { test, expect, type Page } from "@playwright/test";
import { installMock } from "./libraryMock";

// Brand shades worked out by src/accent.ts for the default orange (#f7821b) and a Windows-blue system accent
// (#0078d4); the numbers are written out here so the test does not depend on the code under test.
const ORANGE = { button: "rgb(170, 83, 6)", text: "rgb(247, 130, 27)" };
const BLUE = { button: "rgb(0, 109, 193)", text: "rgb(32, 158, 255)" };

/** What the operating system reports as its accent colour (null: it offers none). */
async function systemAccent(page: Page, hex: string | null) {
  await page.addInitScript((value) => {
    (window as any).systemAccent = value;
  }, hex);
}
const brand = (page: Page, token: string) =>
  page.evaluate(
    (name) => {
      const el = document.querySelector(".app-shell")!;
      return getComputedStyle(el).getPropertyValue(name).trim();
    },
    token,
  );
const toRgb = (page: Page, css: string) =>
  page.evaluate((value) => {
    const probe = document.createElement("i");
    probe.style.color = value;
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, css);
async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
}

test("by default the highlight colour is XpieDB's orange, not blue", async ({ page }) => {
  await systemAccent(page, "#0078d4");
  await installMock(page);
  expect(await toRgb(page, await brand(page, "--colorBrandBackground"))).toBe(ORANGE.button);
  expect(await toRgb(page, await brand(page, "--colorBrandForeground1"))).toBe(ORANGE.text);
  // A primary button really is orange.
  await openSettings(page);
  const bg = await page
    .getByRole("switch", { name: "Use the system accent colour" })
    .evaluate(() => getComputedStyle(document.querySelector(".app-shell")!).getPropertyValue("--colorBrandBackground"));
  expect(await toRgb(page, bg)).toBe(ORANGE.button);
});

test("turning on the system accent switches the whole app to it, and off brings the orange back", async ({ page }) => {
  await systemAccent(page, "#0078d4");
  await installMock(page);
  await openSettings(page);
  const toggle = page.getByRole("switch", { name: "Use the system accent colour" });
  await expect(toggle).not.toBeChecked();
  await expect(page.locator(".accent-hex")).toHaveText("#0078d4");
  await toggle.check();
  await expect(toggle).toBeChecked();
  expect(await toRgb(page, await brand(page, "--colorBrandBackground"))).toBe(BLUE.button);
  expect(await toRgb(page, await brand(page, "--colorBrandForeground1"))).toBe(BLUE.text);
  expect((await page.evaluate(() => (window as any).preferenceWrites)).at(-1)).toEqual(["accent_source", "system"]);
  await toggle.uncheck();
  expect(await toRgb(page, await brand(page, "--colorBrandBackground"))).toBe(ORANGE.button);
  expect((await page.evaluate(() => (window as any).preferenceWrites)).at(-1)).toEqual(["accent_source", "app"]);
});

test("the saved choice is applied when the app opens", async ({ page }) => {
  await systemAccent(page, "#0078d4");
  await installMock(page, { preferences: { accent_source: "system" } });
  await expect.poll(async () => toRgb(page, await brand(page, "--colorBrandBackground"))).toBe(BLUE.button);
});

test("the app follows a system accent that changes while it is open", async ({ page }) => {
  await systemAccent(page, "#0078d4");
  await installMock(page, { preferences: { accent_source: "system" } });
  await expect.poll(async () => toRgb(page, await brand(page, "--colorBrandBackground"))).toBe(BLUE.button);
  // The system accent becomes green; the app notices when its window is focused again.
  await page.evaluate(() => {
    (window as any).systemAccent = "#62ba46";
    window.dispatchEvent(new Event("focus"));
  });
  await expect.poll(async () => toRgb(page, await brand(page, "--colorBrandBackground"))).not.toBe(BLUE.button);
  const green = await toRgb(page, await brand(page, "--colorBrandForeground1"));
  const [r, g, b] = green.match(/\d+/g)!.map(Number);
  expect(g).toBeGreaterThan(r);
  expect(g).toBeGreaterThan(b);
});

test("a window that cannot report the system accent keeps the orange and explains why", async ({ page }) => {
  await systemAccent(page, null);
  await installMock(page, { preferences: { accent_source: "system" } });
  expect(await toRgb(page, await brand(page, "--colorBrandBackground"))).toBe(ORANGE.button);
  await openSettings(page);
  const toggle = page.getByRole("switch", { name: "Use the system accent colour" });
  await expect(toggle).toBeDisabled();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText("does not share its accent colour")).toBeVisible();
});

test("white text stays readable on the primary button whatever the accent", async ({ page }) => {
  for (const accent of ["#ffff00", "#ffffff", "#000000", "#00ffff", "#767676"]) {
    await systemAccent(page, accent);
    await installMock(page, { preferences: { accent_source: "system" } });
    const ratio = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector(".app-shell")!);
      const probe = document.createElement("i");
      document.body.appendChild(probe);
      const lum = (css: string) => {
        probe.style.color = css;
        const [r, g, b] = getComputedStyle(probe).color.match(/\d+/g)!.map(Number).map((v) => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const a = lum(cs.getPropertyValue("--colorBrandBackgroundHover"));
      const w = lum(cs.getPropertyValue("--colorNeutralForegroundOnBrand"));
      probe.remove();
      return (Math.max(a, w) + 0.05) / (Math.min(a, w) + 0.05);
    });
    expect(ratio, accent).toBeGreaterThanOrEqual(4.5);
  }
});
