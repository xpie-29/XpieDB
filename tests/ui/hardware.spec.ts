import { test, expect, type Page } from "@playwright/test";
import { installMock, sampleHardware } from "./libraryMock";

const rows = (page: Page) =>
  page.getByRole("treegrid", { name: "Hardware" }).locator('[role="row"]:not(.hw-heading)');
const row = (page: Page, name: string) =>
  rows(page).filter({ has: page.locator(".hw-name-text", {
      hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    }), });
const names = async (page: Page) =>
  (await rows(page).evaluateAll((els) =>
    els.map((e) => {
      const text = e.querySelector(".hw-name-text")?.textContent;
      const indent = e.querySelector(".hw-name.depth-1") ? "  " : "";
      return text ? indent + text : `[${e.getAttribute("aria-label")}]`;
    }),
  )) as string[];
const writes = (page: Page) => page.evaluate(() => (window as any).preferenceWrites);
const calls = (page: Page) => page.evaluate(() => (window as any).hardwareCalls);
const detail = (page: Page) => page.getByRole("complementary", { name: "Selected hardware details" });

async function open(page: Page, hardware = sampleHardware(), preferences = {}) {
  await installMock(page, { hardware, preferences: { collection: "hardware", ...preferences } });
  await expect(page.getByRole("heading", { name: "Hardware", level: 1 })).toBeVisible();
}

test("the list groups accessories under their system and puts loose ones last", async ({ page }) => {
  await open(page);
  expect(await names(page)).toEqual([
    "Nintendo Switch",
    "  Joy-Con (pair)",
    "  Pro Controller",
    "PlayStation 4 Pro",
    "  DualShock 4",
    "  PlayStation Camera",
    "Super Nintendo",
    "  SNES Controller",
    "[Loose accessories, 1]",
    "8BitDo SN30",
  ]);
  // 9 items, 3 of them systems.
  await expect(page.getByRole("status")).toHaveText("9 items · 3 systems");
  await expect(row(page, "PlayStation 4 Pro").locator(".hw-count")).toHaveText("2");
});

test("systems collapse and expand with the chevron, the arrow keys, and Expand/Collapse all", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Collapse PlayStation 4 Pro" }).click();
  expect((await names(page)).includes("  DualShock 4")).toBe(false);
  expect((await names(page)).includes("  Joy-Con (pair)")).toBe(true);
  await expect(row(page, "PlayStation 4 Pro")).toHaveAttribute("aria-expanded", "false");

  await row(page, "PlayStation 4 Pro").click();
  await page.keyboard.press("ArrowRight");
  expect((await names(page)).includes("  DualShock 4")).toBe(true);
  await page.keyboard.press("ArrowLeft");
  expect((await names(page)).includes("  DualShock 4")).toBe(false);

  await page.getByRole("button", { name: "Collapse all" }).click();
  expect((await names(page)).filter((n) => n.startsWith("  "))).toEqual([]);
  await page.getByRole("button", { name: "Expand all" }).click();
  expect((await names(page)).filter((n) => n.startsWith("  ")).length).toBe(5);
});

test("arrow keys move the selection through the visible rows", async ({ page }) => {
  await open(page);
  await row(page, "Nintendo Switch").click();
  await page.keyboard.press("ArrowDown");
  await expect(row(page, "Joy-Con (pair)")).toHaveAttribute("aria-selected", "true");
  await expect(detail(page).getByRole("heading", { name: "Joy-Con (pair)" })).toBeVisible();
  await page.keyboard.press("End");
  await expect(row(page, "8BitDo SN30")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(row(page, "Nintendo Switch")).toHaveAttribute("aria-selected", "true");
});

test("Flat lists every item by name with its system, and the choice is saved", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Flat" }).click();
  expect(await writes(page)).toContainEqual(["hardware_grouping", "flat"]);
  expect(await names(page)).toEqual([
    "8BitDo SN30",
    "DualShock 4",
    "Joy-Con (pair)",
    "Nintendo Switch",
    "PlayStation 4 Pro",
    "PlayStation Camera",
    "Pro Controller",
    "SNES Controller",
    "Super Nintendo",
  ]);
  await expect(page.getByRole("columnheader", { name: "Belongs to" })).toBeVisible();
  await expect(row(page, "DualShock 4").getByRole("gridcell").nth(2)).toHaveText("PlayStation 4 Pro");
  await expect(row(page, "8BitDo SN30").getByRole("gridcell").nth(2)).toHaveText("Loose");
  await expect(row(page, "Nintendo Switch").getByRole("gridcell").nth(2)).toHaveText("System");
  // Expand/Collapse all stay in place (disabled) so the Grouped/Flat toggle does not move.
  await expect(page.getByRole("button", { name: "Expand all" })).toBeDisabled();
  await page.getByRole("button", { name: "Grouped" }).click();
  expect((await names(page))[0]).toBe("Nintendo Switch");
});

test("a saved Flat preference is used at startup", async ({ page }) => {
  await open(page, sampleHardware(), { hardware_grouping: "flat" });
  expect((await names(page))[0]).toBe("8BitDo SN30");
});

test("searching for an accessory keeps its system visible, dimmed, and Clear restores the list", async ({ page }) => {
  await open(page);
  await page.getByLabel("Search hardware").fill("dualshock");
  expect(await names(page)).toEqual(["PlayStation 4 Pro", "  DualShock 4"]);
  await expect(row(page, "PlayStation 4 Pro")).toHaveClass(/dimmed/);
  await expect(row(page, "DualShock 4")).not.toHaveClass(/dimmed/);
  await expect(page.getByRole("status")).toHaveText("1 of 9 items");
  await page.getByLabel("Search hardware").fill("zzz");
  await expect(page.getByText("No hardware matches the current search and filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear All Filters" }).click();
  expect((await names(page)).length).toBe(10);
});

test("the type and status filters narrow the list", async ({ page }) => {
  await open(page);
  await page.getByLabel("Type").selectOption("system");
  expect(await names(page)).toEqual(["Nintendo Switch", "PlayStation 4 Pro", "Super Nintendo"]);
  await page.getByLabel("Status").selectOption("Sold");
  expect(await names(page)).toEqual(["Super Nintendo"]);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByLabel("Type")).toHaveValue("");
  expect((await names(page)).length).toBe(10);
});

test("the detail panel shows a system with its accessories, and links between them", async ({ page }) => {
  await open(page);
  await row(page, "PlayStation 4 Pro").click();
  const panel = detail(page);
  await expect(panel.getByRole("heading", { name: "PlayStation 4 Pro" })).toBeVisible();
  await expect(panel).toContainText("Sony");
  await expect(panel).toContainText("$299.99");
  await expect(panel.getByRole("heading", { name: "Accessories (2)" })).toBeVisible();
  await panel.getByRole("button", { name: "DualShock 4" }).click();
  await expect(row(page, "DualShock 4")).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("heading", { name: "DualShock 4" })).toBeVisible();
  await expect(panel).toContainText("$59.99");
  await panel.getByRole("button", { name: "PlayStation 4 Pro" }).click();
  await expect(row(page, "PlayStation 4 Pro")).toHaveAttribute("aria-selected", "true");
});

test("a loose accessory shows its compatible platforms; a sold system shows the sale", async ({ page }) => {
  await open(page);
  await row(page, "8BitDo SN30").click();
  await expect(detail(page)).toContainText("Loose accessory");
  await expect(detail(page)).toContainText("Also works with");
  await expect(detail(page)).toContainText("PC, Nintendo Switch");
  await row(page, "Super Nintendo").click();
  await expect(detail(page)).toContainText("Sold on");
  await expect(detail(page)).toContainText("$120.00");
});

test("an empty collection offers to add hardware", async ({ page }) => {
  await open(page, []);
  await expect(page.getByRole("heading", { name: "No hardware yet" })).toBeVisible();
  await page.getByRole("button", { name: "Add Hardware" }).last().click();
  await expect(page.getByRole("heading", { name: "Add System" })).toBeVisible();
});

test("adding a system saves it, returns to the list, selects and highlights it", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Add Hardware" }).click();
  await expect(page.getByRole("heading", { name: "Add System" })).toBeVisible();
  await page.getByRole("textbox", { name: /^Name/ }).fill("Sega Saturn");
  await page.getByLabel("Platform").selectOption({ label: "Nintendo Switch" });
  await page.getByLabel("Manufacturer").fill("Sega");
  await page.getByLabel("Condition").selectOption("Good");
  await page.getByLabel("Price paid").fill("150");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Hardware", level: 1 })).toBeVisible();
  await expect(row(page, "Sega Saturn")).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "Sega Saturn")).toHaveClass(/just-edited/);
  await expect(detail(page)).toContainText("$150.00");
  const saved = (await calls(page)).find((c: any[]) => c[0] === "save");
  expect(saved[1]).toBeNull();
  expect(saved[2]).toMatchObject({
    kind: "system",
    name: "Sega Saturn",
    manufacturer: "Sega",
    condition: "Good",
    purchase_price_cents: 15000,
    parent_id: null,
  });
});

test("a price that is not a number is refused before saving", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Add Hardware" }).click();
  await page.getByRole("textbox", { name: /^Name/ }).fill("Thing");
  await page.getByLabel("Price paid").fill("abc");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter prices like 49.99.");
  expect(await calls(page)).toEqual([]);
});

test("Add accessory from a system starts with that system as its parent", async ({ page }) => {
  await open(page);
  await row(page, "Nintendo Switch").click();
  await detail(page).getByRole("button", { name: "Add accessory" }).click();
  await expect(page.getByRole("heading", { name: "Add Accessory" })).toBeVisible();
  await expect(page.getByLabel("Belongs to system")).toHaveValue("4");
  await page.getByRole("textbox", { name: /^Name/ }).fill("Charging Grip");
  await page.getByRole("checkbox", { name: "PC" }).check();
  await page.getByRole("button", { name: "Save" }).click();
  expect(await names(page)).toContain("  Charging Grip");
  await row(page, "Charging Grip").click();
  await expect(detail(page)).toContainText("PC");
  const saved = (await calls(page)).find((c: any[]) => c[0] === "save");
  expect(saved[2]).toMatchObject({ kind: "accessory", parent_id: 4, compat_platform_ids: [1] });
});

test("an accessory can be loose, and the parent list only offers systems", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Add Hardware" }).click();
  await page.getByLabel("Type").selectOption("accessory");
  const options = await page.getByLabel("Belongs to system").locator("option").allTextContents();
  expect(options).toEqual([
    "None (loose accessory)",
    "Nintendo Switch",
    "PlayStation 4 Pro",
    "Super Nintendo",
  ]);
  await page.getByRole("textbox", { name: /^Name/ }).fill("HDMI cable");
  await page.getByRole("button", { name: "Save" }).click();
  expect(await names(page)).toContain("HDMI cable");
});

test("Edit changes an item and Cancel leaves it alone", async ({ page }) => {
  await open(page);
  await row(page, "DualShock 4").click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit Accessory" })).toBeVisible();
  await page.getByRole("textbox", { name: /^Name/ }).fill("DualShock 4 v2");
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(await names(page)).toContain("  DualShock 4");
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("textbox", { name: /^Name/ }).fill("DualShock 4 v2");
  await page.getByRole("button", { name: "Save" }).click();
  expect(await names(page)).toContain("  DualShock 4 v2");
  await expect(row(page, "DualShock 4 v2")).toHaveClass(/just-edited/);
});

test("selling a system asks about each accessory; the rest become loose", async ({ page }) => {
  await open(page);
  await row(page, "PlayStation 4 Pro").click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Status").selectOption("Sold");
  await page.getByLabel("Sold on").fill("2026-09-30");
  await page.getByLabel("Price received").fill("200");
  await page.getByRole("button", { name: "Save" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("What happens to the accessories of PlayStation 4 Pro?");
  // Both are ticked by default; keep the DualShock.
  await expect(dialog.getByRole("checkbox")).toHaveCount(2);
  await dialog.getByRole("checkbox", { name: /DualShock 4/ }).uncheck();
  await dialog.getByRole("button", { name: "Save" }).click();
  const saved = (await calls(page)).find((c: any[]) => c[0] === "save");
  expect(saved[3]).toEqual([3]);
  expect(saved[2]).toMatchObject({ status: "Sold", sale_date: "2026-09-30", sale_price_cents: 20000 });
  const list = await names(page);
  expect(list.indexOf("[Loose accessories, 2]")).toBeGreaterThan(-1);
  expect(list).toContain("DualShock 4");
  await row(page, "DualShock 4").click();
  await expect(detail(page)).toContainText("Loose (was with PlayStation 4 Pro)");
  await row(page, "PlayStation Camera").click();
  await expect(detail(page)).toContainText("Sold");
});

test("Back in the sale dialog changes nothing", async ({ page }) => {
  await open(page);
  await row(page, "Nintendo Switch").click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Status").selectOption("Gifted");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Back" }).click();
  expect(await calls(page)).toEqual([]);
  await expect(page.getByRole("heading", { name: "Edit System" })).toBeVisible();
});

test("deleting a system keeps its accessories as loose ones", async ({ page }) => {
  await open(page);
  await row(page, "Nintendo Switch").click();
  await page.getByRole("button", { name: "Delete hardware" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Its accessories are kept and become loose accessories.");
  await dialog.getByRole("button", { name: "Delete" }).click();
  expect(await calls(page)).toContainEqual(["delete", 4]);
  const list = await names(page);
  expect(list).not.toContain("Nintendo Switch");
  expect(list).toContain("[Loose accessories, 3]");
  expect(list).toContain("Joy-Con (pair)");
});

test("deleting an accessory shows no warning about accessories", async ({ page }) => {
  await open(page);
  await row(page, "DualShock 4").click();
  await page.getByRole("button", { name: "Delete hardware" }).click();
  await expect(page.getByRole("dialog")).not.toContainText("accessories are kept");
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  expect(await names(page)).not.toContain("  DualShock 4");
});

test("returning from the editor keeps the scroll position", async ({ page }) => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    ...sampleHardware()[0],
    id: 100 + i,
    name: `System ${String(i).padStart(2, "0")}`,
  }));
  await open(page, many);
  const pane = page.locator(".library-pane");
  await row(page, "System 45").scrollIntoViewIfNeeded();
  await page.waitForTimeout(50);
  const before = await pane.evaluate((e) => e.scrollTop);
  expect(before).toBeGreaterThan(300);
  await row(page, "System 45").click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(Math.abs((await pane.evaluate((e) => e.scrollTop)) - before)).toBeLessThanOrEqual(2);
});

test("the Games-only view and cover-size controls are not shown in Hardware", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("group", { name: "Library view" })).toHaveCount(0);
  await expect(page.getByLabel("Cover size")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /^Collection:/ }).click();
  await page.getByRole("menuitemradio", { name: "Games" }).click();
  await expect(page.getByRole("group", { name: "Library view" })).toBeVisible();
});

test("an item with no platform shows a dash, not a question mark", async ({ page }) => {
  const none = { ...sampleHardware()[6], platform_id: null, compat_platform_ids: [] };
  await open(page, [none]);
  await expect(row(page, "8BitDo SN30").getByRole("gridcell").first()).toHaveText("-");
  await expect(detail(page)).toContainText("Not specified");
  await expect(page.getByText("?", { exact: true })).toHaveCount(0);
});

test("the Games collection is unaffected by the hardware list", async ({ page }) => {
  await installMock(page, { hardware: sampleHardware() });
  await expect(page.locator(".game-card").first()).toBeVisible();
  await expect(page.locator(".hardware-view")).toHaveCount(0);
});
