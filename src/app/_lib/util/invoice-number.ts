import { prisma } from "@/app/_lib/prisma";
import type { Prisma } from "@prisma/client";

type PrismaTxClient = Prisma.TransactionClient;

/**
 * Generate a sequential invoice number for a location.
 *
 * Format: `INV/{LOCATION_CODE}/{YYYY}/{MM}/{NNNN}` where NNNN is the monthly
 * running sequence (per location), zero-padded to 4 digits and reset each month.
 *
 * Concurrency: the running number comes from an atomic single-row increment
 * (`update: { last_number: { increment: 1 } }`) on the unique
 * (location_id, year, month) row. Prisma compiles the upsert to a native
 * `INSERT ... ON CONFLICT DO UPDATE`, which Postgres serializes at the row
 * level, preventing duplicate numbers under concurrent calls.
 */
export async function generateInvoiceNumber(
  locationId: number,
  date?: Date,
  client: PrismaTxClient = prisma
): Promise<string> {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  const location = await client.location.findUnique({
    where: { id: locationId },
  });
  const code =
    location?.code && location.code.trim().length > 0
      ? location.code.trim()
      : `LOC${locationId}`;

  const seq = await client.invoiceSequence.upsert({
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
 * The sequence increment and the bill update run in a single transaction so a
 * failed update rolls back the consumed sequence number (no wasted numbers),
 * while the increment itself stays atomic against concurrent callers.
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
  await prisma.$transaction(async (tx) => {
    const invoiceNumber = await generateInvoiceNumber(locationId, date, tx);
    await tx.bill.update({
      where: { id: billId },
      data: { invoice_number: invoiceNumber },
    });
  });
}
