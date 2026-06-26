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

  test("dashboard shows each fact once (no duplicate cards/tables)", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    const main = page.getByRole("main");

    // Single occupancy card (replaces the three room cards).
    await expect(main.getByText("Tingkat Hunian")).toHaveCount(1);

    // Thin activity line for realized check-in/out.
    await expect(main.getByText(/Aktivitas hari ini:/)).toBeVisible();

    // "Check-in Hari Ini" now appears ONCE — only the task tile, not also a stat card.
    await expect(main.getByText("Check-in Hari Ini")).toHaveCount(1);

    // The Outstanding Bills table is gone (covered by the Tagihan Terlambat tile).
    await expect(main.getByText("Tagihan Belum Lunas")).toHaveCount(0);

    // Recent payments table is retained.
    await expect(main.getByRole("heading", { name: "Pembayaran Terbaru" })).toBeVisible();
  });
});
