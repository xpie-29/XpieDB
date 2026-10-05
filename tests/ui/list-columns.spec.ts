import { test, expect, type Page } from "@playwright/test";
import { installMock } from "./libraryMock";

const writes = (page: Page) =>
  page.evaluate(() => (window as any).preferenceWrites);

test("list: dragging a column border resizes it, keeps a minimum, and saves the width", async ({
  page,
}) => {
  await installMock(page, { preferences: { library_view: "list" } });
  const head = page.getByRole("columnheader", { name: "Genre" });
  const width = async () => (await head.boundingBox())!.width;
  const start = await width();
  expect(Math.round(start)).toBe(140);
  const handle = page.getByRole("separator", { name: "Resize Genre column" });
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y, { steps: 5 });
  await page.mouse.up();
  expect(Math.round(await width())).toBe(200);
  // Cells follow the header.
  const cell = page.locator(".list-row:not(.list-heading) > :nth-child(3)").first();
  expect(Math.round((await cell.boundingBox())!.width)).toBe(200);
  const saved = (await writes(page)).filter((w: string[]) => w[0] === "list_columns");
  expect(saved).toHaveLength(1);
  expect(JSON.parse(saved[0][1]).genre).toBe(200);
  // Dragging far to the left stops at the minimum.
  const box2 = (await handle.boundingBox())!;
  await page.mouse.move(box2.x + 5, box2.y + 10);
  await page.mouse.down();
  await page.mouse.move(box2.x - 400, box2.y + 10, { steps: 5 });
  await page.mouse.up();
  expect(Math.round(await width())).toBe(50);
});

test("list: widths come back from saved preferences, with bad values ignored", async ({
  page,
}) => {
  await installMock(page, {
    preferences: {
      library_view: "list",
      list_columns: JSON.stringify({ title: 400, genre: 5, status: "wide" }),
    },
  });
  const w = async (name: string) =>
    Math.round((await page.getByRole("columnheader", { name }).boundingBox())!.width);
  expect(await w("Title")).toBe(400);
  expect(await w("Genre")).toBe(50); // clamped to the minimum
  expect(await w("Status")).toBe(100); // invalid, so the default
});

test("list: double-clicking a border fits the column; Reset columns restores defaults", async ({
  page,
}) => {
  await installMock(page, { preferences: { library_view: "list" } });
  const head = page.getByRole("columnheader", { name: "Title" });
  await expect(page.getByRole("button", { name: "Reset columns" })).toHaveCount(0);
  await page.getByRole("separator", { name: "Resize Title column" }).dblclick();
  // "Game 01" is much shorter than the 220px default.
  const fitted = (await head.boundingBox())!.width;
  expect(fitted).toBeLessThan(200);
  expect(fitted).toBeGreaterThanOrEqual(80);
  await page.getByRole("button", { name: "Reset columns" }).click();
  expect(Math.round((await head.boundingBox())!.width)).toBe(220);
  const last = (await writes(page)).at(-1);
  expect(last[0]).toBe("list_columns");
  expect(JSON.parse(last[1]).title).toBe(220);
});

test("list: arrow keys resize a focused border", async ({ page }) => {
  await installMock(page, { preferences: { library_view: "list" } });
  const handle = page.getByRole("separator", { name: "Resize Media column" });
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("columnheader", { name: "Media" }),
  ).toHaveJSProperty("offsetWidth", 90);
});
