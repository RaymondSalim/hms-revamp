import { test, expect, type Page } from "@playwright/test";
import { VIEWER, ROUTES } from "../fixtures/test-data";

// Fresh context — do not reuse the admin session.
test.use({ storageState: { cookies: [], origins: [] } });

async function loginAsViewer(page: Page) {
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

  // Transactional page: the mutating create button is disabled, but the
  // read-only "Detail" row action must REMAIN enabled for everyone.
  test("bills: create disabled, but read-only Detail stays enabled", async ({ page }) => {
    await loginAsViewer(page);
    await page.goto(ROUTES.bills);
    await expect(page.getByRole("main").getByRole("heading", { name: "Tagihan" })).toBeVisible();

    const createBtn = page.getByRole("button", { name: "+ Tambah Tagihan" });
    await expect(createBtn).toBeDisabled();

    const firstRow = page.locator("table tbody tr").first();
    await expect(firstRow).toBeVisible();
    // "Detail" is a read-only inline action — it must not be disabled.
    const detailBtn = firstRow.locator('button[title="Detail"]');
    await expect(detailBtn).toBeEnabled();
  });
});
