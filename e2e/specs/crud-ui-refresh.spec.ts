import { test, expect } from "@playwright/test";
import { ROUTES } from "../fixtures/test-data";

test.describe("CRUD mutations update UI without manual refresh", () => {
  test.describe("Tenant 360° notes", () => {
    test("adding a note shows it immediately", async ({ page }) => {
      await page.goto(ROUTES.tenants);
      // Navigate to first tenant's 360° page via name link
      const tenantLink = page.locator("table tbody tr").first().locator("a").first();
      const tenantName = await tenantLink.textContent();
      await tenantLink.click();
      await expect(page.getByRole("heading", { name: tenantName! })).toBeVisible();

      // Add a note
      const noteText = `E2E test note ${Date.now()}`;
      await page.locator("textarea").fill(noteText);
      await page.getByRole("button", { name: "Simpan Catatan" }).click();

      // Toast appears and note is visible without refresh
      await expect(page.getByText("Catatan ditambahkan")).toBeVisible();
      await expect(page.getByText(noteText)).toBeVisible();
    });

    test("deleting a note removes it immediately", async ({ page }) => {
      await page.goto(ROUTES.tenants);
      const tenantLink = page.locator("table tbody tr").first().locator("a").first();
      await tenantLink.click();

      // Add a note first so we have something to delete
      const noteText = `E2E delete me ${Date.now()}`;
      await page.locator("textarea").fill(noteText);
      await page.getByRole("button", { name: "Simpan Catatan" }).click();
      await expect(page.getByText(noteText)).toBeVisible();

      // Delete it — find the note card containing our text and click its Hapus button
      const noteCards = page.locator("div.rounded-lg.border.p-3");
      const targetCard = noteCards.filter({ hasText: noteText });
      await targetCard.getByRole("button", { name: "Hapus" }).click();
      // Confirm dialog (useConfirm uses "Ya, lanjutkan" as default confirm label)
      await page.getByRole("button", { name: "Ya, lanjutkan" }).click();

      await expect(page.getByText("Catatan dihapus")).toBeVisible();
      await expect(page.getByText(noteText)).not.toBeVisible();
    });
  });

  test.describe("Tenant 360° edit button", () => {
    test("edit button navigates to tenants page and opens modal", async ({ page }) => {
      await page.goto(ROUTES.tenants);
      const tenantLink = page.locator("table tbody tr").first().locator("a").first();
      await tenantLink.click();

      // Click the Edit button on the profile header
      await page.getByRole("link", { name: "Edit" }).click();

      // Should be on the tenants page with the modal open
      await expect(page).toHaveURL(/\/residents\/tenants\?edit=/);
      await expect(page.getByRole("heading", { name: "Edit Penghuni" })).toBeVisible();
    });
  });

  test.describe("Locations CRUD", () => {
    test("creating a location shows it in the table", async ({ page }) => {
      await page.goto(ROUTES.locations);
      await expect(page.getByRole("heading", { name: "Lokasi" })).toBeVisible();

      const locName = `E2E Location ${Date.now()}`;
      await page.getByRole("button", { name: "+ Tambah Lokasi" }).click();
      await expect(page.getByRole("heading", { name: "Tambah Lokasi" })).toBeVisible();

      await page.locator('input[name="name"]').fill(locName);
      await page.locator('input[name="address"]').fill("Jl. Test E2E No. 1");
      await page.getByRole("button", { name: "Simpan" }).click();

      await expect(page.getByText(/Lokasi berhasil ditambahkan/)).toBeVisible();
      await expect(page.getByRole("cell", { name: locName })).toBeVisible();
    });

    test("deleting a location removes it from the table", async ({ page }) => {
      await page.goto(ROUTES.locations);

      // Create one first
      const locName = `E2E Del ${Date.now()}`;
      await page.getByRole("button", { name: "+ Tambah Lokasi" }).click();
      await page.locator('input[name="name"]').fill(locName);
      await page.locator('input[name="address"]').fill("Jl. Delete Me");
      await page.getByRole("button", { name: "Simpan" }).click();
      await expect(page.getByRole("cell", { name: locName })).toBeVisible();

      // Delete it via ActionMenu (inline icon buttons with title attributes)
      const row = page.getByRole("row", { name: new RegExp(locName) });
      await row.getByRole("button", { name: "Hapus" }).click();
      // Confirm modal
      await page.getByRole("button", { name: "Hapus" }).last().click();

      await expect(page.getByText("Lokasi berhasil dihapus")).toBeVisible();
      await expect(page.getByRole("cell", { name: locName })).not.toBeVisible();
    });
  });

  test.describe("Durations CRUD", () => {
    test("creating a duration shows it in the table", async ({ page }) => {
      await page.goto(ROUTES.durations);
      await expect(page.getByRole("heading", { name: "Durasi" })).toBeVisible();

      const durLabel = `E2E ${Date.now()}`;
      await page.getByRole("button", { name: "+ Tambah Durasi" }).click();
      await expect(page.getByRole("heading", { name: "Tambah Durasi" })).toBeVisible();

      await page.locator('input[name="duration"]').fill(durLabel);
      await page.locator('input[name="month_count"]').fill("2");
      await page.getByRole("button", { name: "Simpan" }).click();

      await expect(page.getByText(/Durasi berhasil ditambahkan/)).toBeVisible();
      await expect(page.getByRole("cell", { name: durLabel })).toBeVisible();
    });

    test("deleting a duration removes it from the table", async ({ page }) => {
      await page.goto(ROUTES.durations);

      // Create one first
      const durLabel = `E2E Del ${Date.now()}`;
      await page.getByRole("button", { name: "+ Tambah Durasi" }).click();
      await page.locator('input[name="duration"]').fill(durLabel);
      await page.locator('input[name="month_count"]').fill("1");
      await page.getByRole("button", { name: "Simpan" }).click();
      await expect(page.getByRole("cell", { name: durLabel })).toBeVisible();

      // Delete via ActionMenu (inline icon buttons with title attributes)
      const row = page.getByRole("row", { name: new RegExp(durLabel) });
      await row.getByRole("button", { name: "Hapus" }).click();
      // Confirm modal
      await page.getByRole("button", { name: "Hapus" }).last().click();

      await expect(page.getByText("Durasi berhasil dihapus")).toBeVisible();
      await expect(page.getByRole("cell", { name: durLabel })).not.toBeVisible();
    });
  });
});
