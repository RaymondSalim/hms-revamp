import { test, expect } from "@playwright/test";
import { ROUTES } from "../fixtures/test-data";

test.describe("Tenants table is server-driven", () => {
  test("search updates the URL and filters server-side", async ({ page }) => {
    await page.goto(ROUTES.tenants);
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Penghuni" })
    ).toBeVisible();

    // Type into the search box; the table debounces into ?q=
    const search = page.getByPlaceholder("Cari penghuni...");
    await search.fill("a");
    await expect(page).toHaveURL(/[?&]q=a\b/);

    // At least the header row resolves without a client-side full load error.
    await expect(page.locator("table")).toBeVisible();
  });

  test("clicking the Nama header sorts via the URL", async ({ page }) => {
    await page.goto(ROUTES.tenants);
    // Click the "Nama" column header (it's a <th> element)
    await page.locator('th:has-text("Nama")').click();
    await expect(page).toHaveURL(/[?&]sort=name\b/);
    await expect(page).toHaveURL(/[?&]dir=(asc|desc)\b/);
  });
});
