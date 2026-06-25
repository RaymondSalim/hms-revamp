import { test, expect } from "@playwright/test";
import { ROUTES } from "../fixtures/test-data";

test.describe("Dashboard Today's Tasks panel", () => {
  test("renders the four task tiles", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Tugas Hari Ini" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Pembayaran Belum Diverifikasi/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Tagihan Terlambat/ })).toBeVisible();
  });

  test("unverified-payments tile drills down to the filtered payments page", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    await page.getByRole("link", { name: /Pembayaran Belum Diverifikasi/ }).click();
    await expect(page).toHaveURL(/\/payments\?status=pending/);
    await expect(page.getByText("Terjadi Kesalahan")).toHaveCount(0);
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Pembayaran" })
    ).toBeVisible();
  });
});
