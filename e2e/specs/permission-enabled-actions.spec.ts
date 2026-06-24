import { test, expect } from "@playwright/test";
import { ROUTES } from "../fixtures/test-data";

// Uses the default admin storageState configured by the chromium project.
test.describe("Admin sees manage actions enabled", () => {
  test("locations: create button is enabled", async ({ page }) => {
    await page.goto(ROUTES.locations);
    await expect(page.getByRole("button", { name: "+ Tambah Lokasi" })).toBeEnabled();
  });
});
