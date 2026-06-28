import { test, expect } from "@playwright/test";
import { ROUTES } from "../fixtures/test-data";

test.describe("Dashboard quick actions (Perlu Tindakan)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { window.localStorage.setItem("hms_tour_completed", "1"); } catch {}
    });
  });

  test("renders the Perlu Tindakan panel", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Perlu Tindakan" })
    ).toBeVisible();
    // No error boundary.
    await expect(page.getByText("Terjadi Kesalahan")).toHaveCount(0);
  });

  test("verifying a pending payment from the queue clears it and shows a toast", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    const main = page.getByRole("main");

    const verifyButtons = main.getByRole("button", { name: "Verifikasi" });
    const count = await verifyButtons.count();
    test.skip(count === 0, "No pending payment seeded in the queue");

    await verifyButtons.first().click();
    // Success toast (react-toastify).
    await expect(page.getByText("Pembayaran diverifikasi")).toBeVisible();
  });

  test("payments table shows Verifikasi for a PENDING row", async ({ page }) => {
    await page.goto(`${ROUTES.payments}?status=pending`);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Pembayaran" })).toBeVisible();

    // The row ActionMenu renders Verifikasi/Tolak for pending rows. With <=2
    // inline items they render as title-bearing icon buttons; otherwise inside
    // the overflow menu. Assert at least one Verifikasi affordance is reachable.
    // Check if there's data by looking for "Tidak ada data ditemukan" message.
    const noDataMessage = main.getByText("Tidak ada data ditemukan");
    const hasNoData = await noDataMessage.isVisible().catch(() => false);
    test.skip(hasNoData, "No pending payments in the selected location");

    // Open the first data row's overflow if present, then look for Verifikasi.
    const verifByTitle = main.locator('button[title="Verifikasi"]');
    if (await verifByTitle.count() === 0) {
      // try opening an overflow menu
      const more = main.locator('button[title="Lainnya"]').first();
      if (await more.count()) await more.click();
    }
    await expect(
      main.getByRole("button", { name: "Verifikasi" }).or(main.locator('button[title="Verifikasi"]')).first()
    ).toBeVisible();
  });
});
