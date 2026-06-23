import { test as setup, expect } from "@playwright/test";
import { ADMIN, ADMIN_STORAGE_STATE, ROUTES } from "./fixtures/test-data";

// Logs in as the seeded admin through the real login form and persists the
// session. The chromium project loads this storageState so specs start
// authenticated. The smoke spec still exercises login explicitly.
setup("authenticate as admin", async ({ page }) => {
  await page.goto(ROUTES.login);
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.getByRole("button", { name: "Masuk" }).click();

  await page.waitForURL(`**${ROUTES.dashboard}`);
  await expect(page).toHaveURL(new RegExp(`${ROUTES.dashboard}$`));

  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
