import { prisma } from "@/app/_lib/prisma";

/**
 * Generate a sequential invoice number for a location.
 *
 * Format: `INV/{LOCATION_CODE}/{YYYY}/{MM}/{NNNN}` where NNNN is the monthly
 * running sequence (per location), zero-padded to 4 digits and reset each month.
 *
 * Concurrency: the running number comes from an atomic single-row increment
 * (`update: { last_number: { increment: 1 } }`) on the unique
 * (location_id, year, month) row, which Postgres serializes at the row level,
 * preventing duplicate numbers under concurrent calls.
 */
export async function generateInvoiceNumber(
  locationId: number,
  date?: Date
): Promise<string> {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  const location = await prisma.location.findUnique({
    where: { id: locationId },
  });
  const code =
    location?.code && location.code.trim().length > 0
      ? location.code.trim()
      : `LOC${locationId}`;

  const seq = await prisma.invoiceSequence.upsert({
    where: {
      location_id_year_month: { location_id: locationId, year, month },
    },
    create: { location_id: locationId, year, month, last_number: 1 },
    update: { last_number: { increment: 1 } },
  });
  const n = seq.last_number;

  const yyyy = String(year);
  const mm = String(month).padStart(2, "0");
  const nnnn = String(n).padStart(4, "0");

  return `INV/${code}/${yyyy}/${mm}/${nnnn}`;
}

/**
 * Generate and assign an invoice number to an existing bill.
 *
 * Guard: if `locationId` is null the bill keeps a null invoice_number (skipped).
 * This keeps bill creation working for rooms that lack a location (e.g. some
 * test fixtures) instead of crashing.
 */
export async function assignInvoiceNumber(
  billId: number,
  locationId: number | null,
  date?: Date
): Promise<void> {
  if (locationId == null) return;
  const invoiceNumber = await generateInvoiceNumber(locationId, date);
  await prisma.bill.update({
    where: { id: billId },
    data: { invoice_number: invoiceNumber },
  });
}
