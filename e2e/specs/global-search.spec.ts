import { test, expect } from "@playwright/test";
import { ROUTES } from "../fixtures/test-data";

const SEEDED_TENANT = "Ahmad"; // seeded tenant: Ahmad Wijaya
const SEEDED_INVOICE = "INV/SDK"; // seeded invoice prefix for Sudirman location

test.describe("Global command-palette search", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { window.localStorage.setItem("hms_tour_completed", "1"); } catch {}
    });
  });

  test("Cmd-K opens the palette and finds a tenant, navigating to detail", async ({ page }) => {
    await page.goto(ROUTES.dashboard);

    await page.keyboard.press("Meta+k"); // chromium on the harness maps Meta
    const input = page.getByPlaceholder(/Cari penyewa/);
    await expect(input).toBeVisible();

    await input.fill(SEEDED_TENANT);
    // Penyewa group appears with at least one result
    await expect(page.getByText("Penyewa", { exact: true })).toBeVisible();
    const firstTenant = page.getByRole("button").filter({ hasText: SEEDED_TENANT }).first();
    await firstTenant.click();
    await expect(page).toHaveURL(/\/residents\/tenants\/[^/]+$/);
  });

  test("searching an invoice number drills down to the filtered bills page", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    await page.getByRole("button", { name: /Cari/ }).waitFor({ state: "visible" });
    await page.keyboard.press("Meta+k");
    const input = page.getByPlaceholder(/Cari penyewa/);
    await input.fill(SEEDED_INVOICE);
    await expect(page.getByText("Tagihan", { exact: true })).toBeVisible();
    await page.getByRole("button").filter({ hasText: SEEDED_INVOICE }).first().click();
    await expect(page).toHaveURL(/\/bills\?q=/);
    await expect(page.getByText("Terjadi Kesalahan")).toHaveCount(0);
  });
});
