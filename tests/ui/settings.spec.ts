import { test, expect, type Page } from "@playwright/test";
import { installMock } from "./libraryMock";

const igdb = (page: Page) => page.locator(".igdb-settings");
const SETUP = "https://api-docs.igdb.com/#getting-started";

async function openSettings(page: Page) {
  await installMock(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(igdb(page)).toBeVisible();
}

test("IGDB settings explain what IGDB is and how to get access", async ({
  page,
}) => {
  await openSettings(page);
  const text = igdb(page).locator("p.muted");
  await expect(text).toContainText("Internet Game Database");
  await expect(text).toContainText("cover art");
  await expect(text).toContainText("import from Steam");
  await expect(text).toContainText("optional");
  await expect(text).toContainText("Client ID");
  await expect(text).toContainText("Client Secret");
  await expect(text).toContainText("http://localhost");
  await expect(text).toContainText("two-factor authentication");
});

test("the IGDB setup link opens in the browser and leaves the app in place", async ({
  page,
}) => {
  await openSettings(page);
  const before = page.url();
  await igdb(page).getByRole("link", { name: "Set up IGDB access" }).click();
  expect(await page.evaluate(() => (window as any).openedLinks)).toEqual([
    SETUP,
  ]);
  expect(page.url()).toBe(before);
});

test("the status line sits directly below the description and link", async ({
  page,
}) => {
  await openSettings(page);
  const description = (await igdb(page).locator("p.muted").boundingBox())!;
  const status = (await igdb(page)
    .getByText("Not configured", { exact: true })
    .boundingBox())!;
  const client = (await igdb(page).getByLabel("Client ID").boundingBox())!;
  const link = (await igdb(page)
    .getByRole("link", { name: "Set up IGDB access" })
    .boundingBox())!;
  // The link is part of the description, and the status follows it, above the form.
  expect(link.y).toBeGreaterThan(description.y);
  expect(link.y).toBeLessThan(description.y + description.height);
  expect(status.y).toBeGreaterThan(description.y + description.height - 1);
  expect(status.y).toBeLessThan(client.y);
  // The heading comes first.
  const heading = (await igdb(page)
    .getByRole("heading", { name: "IGDB" })
    .boundingBox())!;
  expect(heading.y).toBeLessThan(description.y);
});

test("the status changes when credentials are saved and cleared", async ({
  page,
}) => {
  await openSettings(page);
  await expect(
    igdb(page).getByText("Not configured", { exact: true }),
  ).toBeVisible();
  await igdb(page).getByLabel("Client ID").fill("synthetic-id");
  await igdb(page).getByLabel("Client Secret").fill("synthetic-secret");
  await igdb(page).getByRole("button", { name: "Save credentials" }).click();
  await expect(
    igdb(page).getByText("Credentials configured", { exact: true }),
  ).toBeVisible();
  await expect(
    igdb(page).getByText("Not configured", { exact: true }),
  ).toHaveCount(0);
  await igdb(page).getByRole("button", { name: "Clear credentials" }).click();
  await expect(
    igdb(page).getByText("Not configured", { exact: true }),
  ).toBeVisible();
});

test("the description is present whether or not IGDB is configured", async ({
  page,
}) => {
  await installMock(page);
  await page.evaluate(() => ((window as any).igdbConfigured = true));
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    igdb(page).getByText("Credentials configured", { exact: true }),
  ).toBeVisible();
  await expect(igdb(page).locator("p.muted")).toContainText(
    "Internet Game Database",
  );
});
