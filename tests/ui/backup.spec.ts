import { test, expect, type Page } from "@playwright/test";

type Mode = "ok" | "cancelled" | "backup-error" | "invalid-file" | "slow";

test("backup reports what was saved, and cancelling the dialog is silent", async ({
  page,
}) => {
  await mock(page, "ok");
  await page.getByRole("button", { name: "Back up library..." }).click();
  await expect(backup(page).getByRole("status")).toHaveText(
    "Backed up 2 games and 1 image to /Backups/XpieDB-backup.zip. 1 referenced image could not be found and will show the placeholder.",
  );

  await mock(page, "cancelled");
  await page.getByRole("button", { name: "Back up library..." }).click();
  await expect(backup(page).getByRole("status")).toHaveCount(0);
  await expect(backup(page).getByRole("alert")).toHaveCount(0);
});

test("backup failure is shown and does not lock the page", async ({ page }) => {
  await mock(page, "backup-error");
  await page.getByRole("button", { name: "Back up library..." }).click();
  await expect(backup(page).getByRole("alert")).toHaveText("The disk is full.");
  await expect(
    page.getByRole("button", { name: "Back up library..." }),
  ).toBeEnabled();
});

test("restore asks for confirmation, then reloads the library", async ({
  page,
}) => {
  await mock(page, "ok");
  await page.getByRole("button", { name: "Restore from backup..." }).click();
  const dialog = page.getByRole("dialog", { name: "Restore this backup?" });
  await expect(dialog).toContainText('"my-backup.zip"');
  await expect(dialog).toContainText("3 games and 2 images");
  await expect(dialog).toContainText("will be replaced");
  await expect(dialog).toContainText("safety backup");
  expect(await calls(page, "backup_restore")).toBe(0);

  await dialog.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(backup(page).getByRole("status")).toHaveText(
    "Restored 3 games and 2 images. Your previous library was saved to /Backups/pre-restore.zip.",
  );
  expect(await calls(page, "backup_restore")).toBe(1);
  // Library data is reloaded, not just the message updated.
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByText("Restored Game").first()).toBeVisible();
});

test("cancelling the confirmation restores nothing", async ({ page }) => {
  await mock(page, "ok");
  await page.getByRole("button", { name: "Restore from backup..." }).click();
  await page
    .getByRole("dialog", { name: "Restore this backup?" })
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await calls(page, "backup_restore")).toBe(0);
  expect(await calls(page, "backup_cancel_restore")).toBe(1);
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByText("Original Game").first()).toBeVisible();
});

test("an unusable backup file shows its error without a confirmation", async ({
  page,
}) => {
  await mock(page, "invalid-file");
  await page.getByRole("button", { name: "Restore from backup..." }).click();
  await expect(backup(page).getByRole("alert")).toHaveText(
    "This file is not a valid XpieDB backup.",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("choosing no file to restore does nothing", async ({ page }) => {
  await mock(page, "cancelled");
  await page.getByRole("button", { name: "Restore from backup..." }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(backup(page).getByRole("alert")).toHaveCount(0);
});

test("controls are disabled while a backup is running", async ({ page }) => {
  await mock(page, "slow");
  await page.getByRole("button", { name: "Back up library..." }).click();
  await expect(page.getByText("Working...")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back up library..." }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Restore from backup..." }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Library", exact: true }),
  ).toBeDisabled();
});

const backup = (page: Page) => page.locator(".backup-settings");

async function calls(page: Page, command: string) {
  return page.evaluate(
    (name) => (window as any).calls.filter((c: string) => c === name).length,
    command,
  );
}

async function mock(page: Page, mode: Mode) {
  await page.addInitScript(
    ({ mode }) => {
      const w = window as any;
      const game = (id: number, title: string) => ({
        id,
        igdb_id: null,
        title,
        platform_id: 19,
        account: null,
        release_date: null,
        genre: null,
        developer: null,
        publisher: null,
        cover_path: null,
        media_type: "Physical",
        play_status: "Not Started",
        rating: null,
        tags: [],
        notes_html: "",
        date_added: "2026-01-01",
        date_modified: "2026-01-01",
      });
      const platforms = [
        {
          id: 19,
          name: "PC",
          short_name: "PC",
          is_builtin: true,
          icon_path: null,
          sort_order: 0,
        },
      ];
      let games = [game(1, "Original Game")];
      w.calls = [];
      w.__TAURI_INTERNALS__ = {
        invoke: async (command: string) => {
          w.calls.push(command);
          if (command === "list_games") return games;
          if (command === "list_platforms") return platforms;
          if (command === "get_preferences")
            return {
              library_view: "grid",
              cover_size: "medium",
              library_sort: "title_asc",
            };
          if (command === "get_app_data_info")
            return { appDataDir: "Synthetic in-memory catalog" };
          if (command === "igdb_config") return { configured: false };
          if (command === "backup_create") {
            if (mode === "cancelled") return null;
            if (mode === "backup-error") throw "The disk is full.";
            if (mode === "slow") return new Promise(() => {});
            return {
              path: "/Backups/XpieDB-backup.zip",
              games: 2,
              images: 1,
              missing_images: 1,
            };
          }
          if (command === "backup_choose_restore") {
            if (mode === "cancelled") return null;
            if (mode === "invalid-file")
              throw "This file is not a valid XpieDB backup.";
            return {
              file_name: "my-backup.zip",
              created_at: "2026-01-01T12:00:00Z",
              app_version: "0.1.0",
              games: 3,
              images: 2,
              missing_images: 0,
            };
          }
          if (command === "backup_cancel_restore") return;
          if (command === "backup_restore") {
            games = [game(7, "Restored Game")];
            return {
              games: 3,
              images: 2,
              missing_images: 0,
              safety_backup: "/Backups/pre-restore.zip",
            };
          }
          throw `Unexpected mocked command: ${command}`;
        },
      };
    },
    { mode },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
}
