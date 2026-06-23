import { test, expect, type Page, type Locator } from "@playwright/test";
import { ROUTES } from "../fixtures/test-data";

// The booking form mixes react-select (Penyewa, Kamar) with native <select>
// (Durasi, Status) and plain inputs (Tanggal Mulai, Biaya). Labels are sibling
// <label> elements, not associated via htmlFor, so getByLabel won't work.
// Instead we scope to each field's wrapper <div> by its label text and drive
// the control inside.

/** The wrapper <div> containing a given field label. */
function field(page: Page, label: RegExp): Locator {
  return page
    .locator("div", { has: page.locator("label", { hasText: label }) })
    .last();
}

/**
 * Select an option in a react-select field identified by its label. `filter` is
 * typed to narrow the list; `option` matches the rendered option text (which may
 * differ from the filter — e.g. a room shows "A3 (Studio)").
 */
async function selectReactSelect(
  page: Page,
  label: RegExp,
  filter: string,
  option: string | RegExp
) {
  const combo = field(page, label).getByRole("combobox");
  await combo.click();
  await combo.fill(filter);
  await page.getByRole("option", { name: option }).first().click();
}

test("staff can create a booking", async ({ page }) => {
  await page.goto(ROUTES.bookings);

  // Open the create-booking modal.
  await page.getByRole("button", { name: "+ Tambah Pemesanan" }).click();
  await expect(page.getByRole("heading", { name: "Tambah Pemesanan" })).toBeVisible();

  // Tenant + room (react-select). The default location is "Mi Casa Kemang";
  // room "A3" is seeded there with no existing booking, so no overlap.
  await selectReactSelect(page, /^Penyewa/, "Ahmad Wijaya", "Ahmad Wijaya");
  await selectReactSelect(page, /^Kamar/, "A3", /^A3\b/);

  // Start date (native date input) — future, clear of seeded bookings.
  await field(page, /^Tanggal Mulai/).locator('input[type="date"]').fill("2026-09-01");

  // Duration (native select).
  await field(page, /^Durasi/).locator("select").selectOption({ label: "3 Bulan (3 bulan)" });

  // Monthly fee.
  await field(page, /^Biaya per Bulan/).locator('input[type="number"]').fill("3000000");

  // Submit.
  await page.getByRole("button", { name: "Simpan" }).click();

  // Success toast confirms the server action + DB write succeeded.
  await expect(page.getByText("Pemesanan berhasil ditambahkan")).toBeVisible();

  // The new booking appears in the table (room A3, tenant Ahmad Wijaya).
  await expect(page.getByRole("row", { name: /A3.*Ahmad Wijaya/ })).toBeVisible();
});
