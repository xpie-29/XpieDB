import { test, expect, type Page } from "@playwright/test";
import { installMock, sampleGames } from "./libraryMock";

// In the sample library the Backlog games are Game 08, 18, 28, 38, 48 and 58
// (ids 8, 18, ...), in that order at positions 1-6.
const queueIds = [8, 18, 28, 38, 48, 58];

const rows = (page: Page) => page.locator(".backlog-row");
const ids = async (page: Page) =>
  (await rows(page).evaluateAll((els) =>
    els.map((e) => Number((e as HTMLElement).dataset.id)),
  )) as number[];
const numbers = (page: Page) =>
  rows(page).locator(".backlog-number").allTextContents();
const calls = (page: Page) => page.evaluate(() => (window as any).backlogCalls);
const handle = (page: Page, id: number) =>
  page.locator(`[data-handle="${id}"]`);

async function openBacklog(page: Page, options = {}) {
  await installMock(page, options);
  await page.getByRole("button", { name: "Backlog", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Backlog", exact: true }),
  ).toBeVisible();
}

test("the backlog lists only Backlog games, numbered in their saved order", async ({
  page,
}) => {
  await openBacklog(page);
  expect(await ids(page)).toEqual(queueIds);
  expect(await numbers(page)).toEqual(["1", "2", "3", "4", "5", "6"]);
  await expect(page.getByText("6 games in your order.")).toBeVisible();
  const first = rows(page).first();
  await expect(first).toContainText("Game 08");
  await expect(first).toContainText("PC"); // platform of Game 08
});

test("the order is the saved position, not alphabetical or id order", async ({
  page,
}) => {
  const games = sampleGames().map((g: any) => ({
    ...g,
    backlog_position: null,
  }));
  // Positions deliberately reversed relative to titles.
  [58, 48, 38].forEach((id, i) => {
    const g = games.find((x: any) => x.id === id)!;
    g.play_status = "Backlog";
    g.backlog_position = i + 1;
  });
  await openBacklog(page, { games });
  expect(await ids(page)).toEqual([58, 48, 38]);
  await expect(rows(page).first()).toContainText("Game 58");
});

test("ArrowUp and ArrowDown on the handle move a game and keep focus on it", async ({
  page,
}) => {
  await openBacklog(page);
  await handle(page, 28).focus();
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => ids(page)).toEqual([8, 28, 18, 38, 48, 58]);
  expect(await numbers(page)).toEqual(["1", "2", "3", "4", "5", "6"]);
  await expect(handle(page, 28)).toBeFocused();
  expect(await calls(page)).toEqual([
    ["backlog_set_order", [8, 28, 18, 38, 48, 58]],
  ]);
  await expect(
    page.getByRole("status").filter({ hasText: "Moved Game 28" }),
  ).toHaveText("Moved Game 28 to position 2 of 6.");

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => ids(page)).toEqual([8, 18, 38, 28, 48, 58]);
  await expect(handle(page, 28)).toBeFocused();
});

test("Home and End send a game to the top or bottom; the ends do not save", async ({
  page,
}) => {
  await openBacklog(page);
  await handle(page, 38).focus();
  await page.keyboard.press("End");
  await expect.poll(() => ids(page)).toEqual([8, 18, 28, 48, 58, 38]);
  await page.keyboard.press("Home");
  await expect.poll(() => ids(page)).toEqual([38, 8, 18, 28, 48, 58]);
  const before = (await calls(page)).length;
  await page.keyboard.press("ArrowUp"); // already first
  await page.waitForTimeout(150);
  expect((await calls(page)).length).toBe(before);
  await expect(handle(page, 38)).toBeFocused();
});

test("dragging a handle with the mouse reorders the list live and saves once", async ({
  page,
}) => {
  await openBacklog(page);
  const from = await handle(page, 48).boundingBox();
  const to = await rows(page).nth(1).boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + 5, to!.y + to!.height / 2, { steps: 8 });
  // Numbers and order preview while the mouse is still down.
  await expect.poll(() => ids(page)).toEqual([8, 48, 18, 28, 38, 58]);
  expect(await calls(page)).toEqual([]);
  await page.mouse.up();
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  expect((await calls(page))[0]).toEqual([
    "backlog_set_order",
    [8, 48, 18, 28, 38, 58],
  ]);
  expect(await ids(page)).toEqual([8, 48, 18, 28, 38, 58]);
});

test("dropping where you started, or releasing outside, changes nothing", async ({
  page,
}) => {
  await openBacklog(page);
  const box = (await handle(page, 28).boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + 14, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  expect(await calls(page)).toEqual([]);
  expect(await ids(page)).toEqual(queueIds);
});

test("dragging to the very bottom and the very top works", async ({ page }) => {
  await openBacklog(page);
  let box = (await handle(page, 8).boundingBox())!;
  const last = (await rows(page).last().boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, last.y + last.height + 40, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => ids(page)).toEqual([18, 28, 38, 48, 58, 8]);

  box = (await handle(page, 8).boundingBox())!;
  const first = (await rows(page).first().boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, first.y - 30, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => ids(page)).toEqual([8, 18, 28, 38, 48, 58]);
});

test("Move to top sends a game first; it is disabled for the first game", async ({
  page,
}) => {
  await openBacklog(page);
  await expect(
    page.getByRole("button", { name: "Move Game 08 to top" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Move Game 38 to top" }).click();
  await expect.poll(() => ids(page)).toEqual([38, 8, 18, 28, 48, 58]);
  expect(await numbers(page)).toEqual(["1", "2", "3", "4", "5", "6"]);
});

test("several quick moves are saved in order and the last one wins", async ({
  page,
}) => {
  await openBacklog(page);
  await page.evaluate(() => ((window as any).orderDelay = 120));
  await handle(page, 8).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  // The screen shows the newest request immediately.
  expect(await ids(page)).toEqual([18, 28, 38, 8, 48, 58]);
  await expect.poll(async () => (await calls(page)).length).toBe(3);
  const sent = (await calls(page)).map((c: any) => c[1]);
  expect(sent).toEqual([
    [18, 8, 28, 38, 48, 58],
    [18, 28, 8, 38, 48, 58],
    [18, 28, 38, 8, 48, 58],
  ]);
  await page.waitForTimeout(500);
  expect(await ids(page)).toEqual([18, 28, 38, 8, 48, 58]);
});

test("a failed save shows the error and puts the saved order back", async ({
  page,
}) => {
  await openBacklog(page);
  await page.evaluate(() => ((window as any).failNextOrder = true));
  await handle(page, 18).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("alert")).toHaveText(
    "The backlog has changed. Reopen it and try again.",
  );
  await expect.poll(() => ids(page)).toEqual(queueIds);
});

test("Start playing takes the game off the list and closes the gap", async ({
  page,
}) => {
  await openBacklog(page);
  await page.getByRole("button", { name: "Start playing Game 18" }).click();
  await expect(rows(page)).toHaveCount(5);
  expect(await ids(page)).toEqual([8, 28, 38, 48, 58]);
  expect(await numbers(page)).toEqual(["1", "2", "3", "4", "5"]);
  expect(await calls(page)).toEqual([["backlog_remove", 18, "Playing"]]);
  await expect(page.getByText("5 games in your order.")).toBeVisible();
});

test("Remove from backlog sets the status back to Not Started", async ({
  page,
}) => {
  await openBacklog(page);
  await page
    .getByRole("button", { name: "Remove Game 08 from backlog" })
    .click();
  await expect(rows(page)).toHaveCount(5);
  expect(await calls(page)).toEqual([["backlog_remove", 8, "Not Started"]]);
  expect(await numbers(page)).toEqual(["1", "2", "3", "4", "5"]);
});

test("Add games lists only games outside the backlog and appends them in tick order", async ({
  page,
}) => {
  await openBacklog(page);
  await page.getByRole("button", { name: "Add games..." }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add games to the backlog" });
  // 60 games, 6 already queued.
  await expect(dialog).toContainText("54 games available");
  await expect(dialog.getByLabel(/^Game 08 -/)).toHaveCount(0);
  await dialog.getByLabel("Search games to add").fill("Game 5");
  await dialog.getByLabel(/^Game 55 -/).check();
  await dialog.getByLabel(/^Game 51 -/).check();
  await expect(
    dialog.getByRole("button", { name: "Add 2 games to backlog" }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Add 2 games to backlog" }).click();
  await expect(dialog).toHaveCount(0);

  expect(await ids(page)).toEqual([...queueIds, 55, 51]);
  expect(await numbers(page)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  expect(await calls(page)).toEqual([["backlog_add", [55, 51]]]);
  await expect(page.getByText("8 games in your order.")).toBeVisible();
});

test("Add games needs at least one game and can be cancelled", async ({
  page,
}) => {
  await openBacklog(page);
  await page.getByRole("button", { name: "Add games..." }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add games to the backlog" });
  await expect(
    dialog.getByRole("button", { name: "Add to backlog" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await calls(page)).toEqual([]);
});

test("an empty backlog explains itself and offers to add games", async ({
  page,
}) => {
  const games = sampleGames().map((g: any) =>
    g.play_status === "Backlog"
      ? { ...g, play_status: "Not Started", backlog_position: null }
      : g,
  );
  await openBacklog(page, { games });
  await expect(page.getByText("Your backlog is empty")).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Add games..." }).last().click();
  await expect(
    page.getByRole("dialog", { name: "Add games to the backlog" }),
  ).toBeVisible();
});

test("editing a game from the backlog returns to the backlog", async ({
  page,
}) => {
  await openBacklog(page);
  await page.getByRole("button", { name: "Edit Game 28" }).click();
  await expect(
    page.getByRole("button", { name: "Cancel" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Backlog", exact: true }),
  ).toBeVisible();
  expect(await ids(page)).toEqual(queueIds);
});

test("the game inspector shows the backlog position", async ({ page }) => {
  await installMock(page);
  await page.getByPlaceholder("Search games").fill("Game 28");
  await expect(page.getByLabel("Selected game details")).toContainText(
    "Backlog position",
  );
  await expect(page.getByLabel("Selected game details")).toContainText("#3");
});

test("Backlog is a play-status filter choice", async ({ page }) => {
  await installMock(page);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const status = page.getByLabel("Play Status");
  await expect(status.locator("option", { hasText: "Backlog" })).toHaveCount(1);
});
