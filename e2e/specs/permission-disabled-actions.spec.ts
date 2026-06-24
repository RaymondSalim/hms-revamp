import { test, expect } from "@playwright/test";
import { VIEWER, ROUTES } from "../fixtures/test-data";

// Fresh context — do not reuse the admin session.
test.use({ storageState: { cookies: [], origins: [] } });

async function loginAsViewer(page) {
  await page.goto(ROUTES.login);
  await page.locator('input[type="email"]').fill(VIEWER.email);
  await page.locator('input[type="password"]').fill(VIEWER.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL(`**${ROUTES.dashboard}`);
}

test.describe("Viewer sees manage actions disabled", () => {
  test("locations: create button is disabled", async ({ page }) => {
    await loginAsViewer(page);
    await page.goto(ROUTES.locations);
    await expect(page.getByRole("main").getByRole("heading", { name: "Lokasi" })).toBeVisible();
    const createBtn = page.getByRole("button", { name: "+ Tambah Lokasi" });
    await expect(createBtn).toBeDisabled();
  });

  test("locations: a row's Edit/Hapus actions are disabled", async ({ page }) => {
    await loginAsViewer(page);
    await page.goto(ROUTES.locations);
    // Wait for at least one data row.
    const firstRow = page.locator("table tbody tr").first();
    await expect(firstRow).toBeVisible();
    // The ActionMenu renders icon buttons with title attributes
    const editBtn = firstRow.locator('button[title*="izin"]').first();
    const deleteBtn = firstRow.locator('button[title*="izin"]').last();
    await expect(editBtn).toBeDisabled();
    await expect(deleteBtn).toBeDisabled();
  });
});
