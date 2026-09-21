import { test, expect, type Page } from "@playwright/test";
import { installMock, sampleGames } from "./libraryMock";

const ribbon = (page: Page) => page.locator(".stats-ribbon");
// Match the label exactly: "Games" alone would also match "24 games".
const tile = (page: Page, label: string) =>
  ribbon(page)
    .locator(".stat-tile")
    .filter({
      has: page.locator(".stat-label", { hasText: new RegExp(`^${label}$`) }),
    });
const card = (page: Page, title: string) =>
  ribbon(page).locator(".chart-card", { hasText: title });
const writes = (page: Page) =>
  page.evaluate(() => (window as any).preferenceWrites);

// Expected numbers come from plain arithmetic on the mock data, not from the app.
const games = sampleGames();
const count = (pick: (g: any) => boolean) => games.filter(pick).length;
const pct = (n: number) => `${Math.round((n / games.length) * 100)}%`;

test("the ribbon is open by default with headline numbers for the whole library", async ({
  page,
}) => {
  await installMock(page);
  await expect(
    ribbon(page).getByRole("button", { name: "Statistics" }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(ribbon(page)).toContainText("Showing your whole library.");
  await expect(tile(page, "Games")).toContainText("60");
  const completed = count((g) => g.play_status === "Completed");
  await expect(tile(page, "Completed")).toContainText(pct(completed));
  await expect(tile(page, "Completed")).toContainText(`${completed} games`);
  // Backlog counts games with the Backlog status; Not Started is shown beneath it.
  const backlog = count((g) => g.play_status === "Backlog");
  const notStarted = count((g) => g.play_status === "Not Started");
  expect(backlog).toBeGreaterThan(0);
  await expect(tile(page, "Backlog")).toContainText(String(backlog));
  await expect(tile(page, "Backlog")).toContainText(
    `${notStarted} not started`,
  );
  await expect(tile(page, "Platforms")).toContainText("8");
  const rated = games.filter((g) => g.rating !== null);
  const average =
    rated.reduce((a, g) => a + (g.rating as number), 0) / rated.length;
  await expect(tile(page, "Average rating")).toContainText(
    `${average.toFixed(1)} / 5`,
  );
  await expect(tile(page, "Average rating")).toContainText(
    `${rated.length} rated`,
  );
  const physical = count((g) => g.media_type === "Physical");
  await expect(tile(page, "Format")).toContainText(`${pct(physical)} physical`);
});

test("games by platform shows shares, folds the tail into Other, and matches the data", async ({
  page,
}) => {
  await installMock(page);
  const rows = card(page, "Games by platform").locator(".bar-list li");
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(0)).toContainText("PC");
  await expect(rows.nth(0)).toContainText(
    pct(count((g) => g.platform_id === 1)),
  );
  await expect(rows.nth(1)).toContainText("PlayStation 4");
  // Platforms 6-8 (3 + 2 + 1 games) fold into one Other row: 6 of 60 games.
  await expect(rows.nth(5)).toContainText("Other (3 platforms)");
  await expect(rows.nth(5)).toContainText("10%");
});

test("play status shows a stacked bar and a legend with counts and shares", async ({
  page,
}) => {
  await installMock(page);
  const legend = card(page, "Games by play status").locator(".legend li");
  await expect(legend).toHaveCount(6);
  for (const status of [
    "Completed",
    "Playing",
    "Not Started",
    "Paused",
    "Dropped",
    "Backlog",
  ]) {
    const n = count((g) => g.play_status === status);
    const row = legend.filter({ hasText: status });
    await expect(row).toContainText(String(n));
    await expect(row).toContainText(pct(n));
  }
  await expect(
    card(page, "Games by play status").locator(".stack-segment"),
  ).toHaveCount(6);
});

test("hovering or focusing a mark shows its value and count", async ({
  page,
}) => {
  await installMock(page);
  const first = card(page, "Games by platform").locator(".bar-list li").first();
  await first.hover();
  const tip = card(page, "Games by platform").getByRole("tooltip");
  await expect(tip).toContainText("30%");
  await expect(tip).toContainText("PC · 18 games");
  await page.mouse.move(0, 0);
  await expect(tip).toHaveCount(0);

  // Keyboard users get the same readout.
  await card(page, "Games by platform").locator(".bar-list li").nth(1).focus();
  await expect(tip).toContainText("PlayStation 4 · 14 games");
});

test("the more-breakdowns tabs switch between genre, decade, rating, added and developer", async ({
  page,
}) => {
  await installMock(page);
  const more = card(page, "More breakdowns");
  await expect(more.locator(".bar-list li").first()).toContainText("Action");
  await more.getByRole("tab", { name: "Decade" }).click();
  await expect(more.locator(".column-label")).toContainText([
    "1990s",
    "2000s",
    "2010s",
    "2020s",
    "Unknown",
  ]);
  await more.getByRole("tab", { name: "Rating" }).click();
  await expect(more.locator(".column-label")).toHaveText([
    "1★",
    "2★",
    "3★",
    "4★",
    "5★",
    "Unrated",
  ]);
  await more.getByRole("tab", { name: "Added" }).click();
  await expect(more.locator(".column-label")).toHaveText([
    "2021",
    "2022",
    "2023",
    "2024",
    "2025",
    "2026",
  ]);
  await more.getByRole("tab", { name: "Developer" }).click();
  await expect(more.locator(".bar-list li").first()).toContainText(
    /Nintendo|Capcom|Square Enix|Valve|Sega|FromSoftware/,
  );
});

test("every chart has a table view with the same numbers", async ({ page }) => {
  await installMock(page);
  const platforms = card(page, "Games by platform");
  await platforms
    .getByRole("button", { name: "Games by platform: show as table" })
    .click();
  await expect(platforms.locator("thead th")).toHaveText([
    "Platform",
    "Games",
    "Share",
  ]);
  // The table lists all eight platforms, not the folded top-five view.
  await expect(platforms.locator("tbody tr")).toHaveCount(8);
  await expect(platforms.locator("tbody tr").first()).toContainText("PC");
  await expect(platforms.locator("tbody tr").first()).toContainText("18");
  await platforms
    .getByRole("button", { name: "Games by platform: show chart" })
    .click();
  await expect(platforms.locator(".bar-list")).toBeVisible();

  const more = card(page, "More breakdowns");
  await more.getByRole("button", { name: /show as table/ }).click();
  await expect(more.getByRole("table")).toBeVisible();
  await expect(
    more.getByText("A game counts once in each of its genres."),
  ).toBeVisible();
});

test("collapsing keeps a one-line summary and remembers the choice", async ({
  page,
}) => {
  await installMock(page);
  await ribbon(page).getByRole("button", { name: "Statistics" }).click();
  await expect(ribbon(page).locator(".stats-body")).toHaveCount(0);
  await expect(
    ribbon(page).getByRole("button", { name: "Statistics" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(ribbon(page)).toContainText("60 games");
  await expect(ribbon(page)).toContainText("40% completed");
  await expect(ribbon(page)).toContainText("8 platforms");
  expect(await writes(page)).toEqual([["stats_open", "false"]]);

  await ribbon(page).getByRole("button", { name: "Statistics" }).click();
  await expect(ribbon(page).locator(".stats-body")).toBeVisible();
  expect(await writes(page)).toEqual([
    ["stats_open", "false"],
    ["stats_open", "true"],
  ]);
});

test("a saved collapsed preference is applied at startup", async ({ page }) => {
  await installMock(page, { preferences: { stats_open: "false" } });
  await expect(
    ribbon(page).getByRole("button", { name: "Statistics" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(ribbon(page).locator(".stats-body")).toHaveCount(0);
});

test("statistics follow the current search and filters", async ({ page }) => {
  await installMock(page);
  await page.getByPlaceholder("Search games").fill("Switch");
  // Every Nintendo Switch game, and nothing else.
  const scoped = games.filter((g) => g.platform_id === 3);
  const n = scoped.length;
  expect(n).toBeGreaterThan(0);
  await expect(tile(page, "Games")).toContainText(String(n));
  await expect(tile(page, "Games")).toContainText("of 60 in library");
  await expect(ribbon(page)).toContainText(
    `Showing the ${n} of 60 games that match your search and filters.`,
  );
  const done = scoped.filter((g) => g.play_status === "Completed").length;
  await expect(tile(page, "Completed")).toContainText(
    `${Math.round((done / n) * 100)}%`,
  );
  await expect(tile(page, "Platforms")).toContainText("1");
  await expect(
    card(page, "Games by platform").locator(".bar-list li"),
  ).toHaveCount(1);

  await ribbon(page).getByRole("button", { name: "Statistics" }).click();
  await expect(ribbon(page)).toContainText(`${n} of 60 games (filtered)`);

  // Clearing the search restores the whole-library numbers.
  await page.getByPlaceholder("Search games").fill("");
  await expect(ribbon(page)).toContainText("60 games");
});

test("no matches gives a clear message instead of empty charts", async ({
  page,
}) => {
  await installMock(page);
  await page.getByPlaceholder("Search games").fill("zzzz-no-such-game");
  await expect(
    ribbon(page).getByText("No games match the current search and filters."),
  ).toBeVisible();
  await expect(ribbon(page).locator(".chart-card")).toHaveCount(0);
  await expect(ribbon(page).getByText("NaN")).toHaveCount(0);
});

test("an empty library has no statistics ribbon", async ({ page }) => {
  await installMock(page, { games: [] });
  await expect(page.getByText("No games yet")).toBeVisible();
  await expect(ribbon(page)).toHaveCount(0);
});

test("a single game and missing data render sensibly", async ({ page }) => {
  await installMock(page, {
    games: [
      {
        ...sampleGames()[0],
        rating: null,
        genre: null,
        developer: null,
        release_date: null,
        play_status: "Playing",
      },
    ],
  });
  await expect(tile(page, "Games")).toContainText("1");
  await expect(tile(page, "Completed")).toContainText("0%");
  await expect(tile(page, "Average rating")).toContainText("—");
  await expect(tile(page, "Average rating")).toContainText("0 rated");
  await expect(card(page, "More breakdowns")).toContainText(
    "Nothing recorded for these games yet.",
  );
  await expect(ribbon(page)).not.toContainText("NaN");
});

test("the ribbon never overflows horizontally at the minimum window width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1040, height: 700 });
  await installMock(page);
  await expect(ribbon(page).locator(".stats-body")).toBeVisible();
  const overflow = await page.evaluate(() => {
    const body = document.querySelector(".stats-body")!;
    return body.scrollWidth - body.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(
    card(page, "More breakdowns").locator(".bar-list li").first(),
  ).toBeVisible();
});
