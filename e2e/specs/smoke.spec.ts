import { test, expect } from "@playwright/test";
import { ADMIN, ROUTES } from "../fixtures/test-data";

test.describe("smoke", () => {
  test("admin can log in", async ({ browser }) => {
    // Fresh context with no stored session so the login form is exercised.
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto(ROUTES.login);
    await page.locator('input[type="email"]').fill(ADMIN.email);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page).toHaveURL(new RegExp(`${ROUTES.dashboard}$`));
    await context.close();
  });

  const pages: { path: string; heading: RegExp }[] = [
    { path: ROUTES.bookings, heading: /^Pemesanan$/ },
    { path: ROUTES.bills, heading: /^Tagihan$/ },
    { path: ROUTES.payments, heading: /^Pembayaran$/ },
    { path: ROUTES.emailLogs, heading: /^Log Email$/ },
  ];

  for (const { path, heading } of pages) {
    test(`core page renders: ${path}`, async ({ page }) => {
      await page.goto(path);
      // Error boundary copy from the dashboard error.tsx — must NOT appear.
      await expect(page.getByText("Terjadi Kesalahan")).toHaveCount(0);
      // Scope to <main>: the header banner also renders an <h1> with the page
      // title, so an unscoped heading match is a strict-mode violation when both
      // are present.
      await expect(
        page.getByRole("main").getByRole("heading", { name: heading })
      ).toBeVisible();
    });
  }
});
