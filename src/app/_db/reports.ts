import { differenceInCalendarDays } from "date-fns";
import { prisma } from "@/app/_lib/prisma";
import { Prisma } from "@prisma/client";

export type AgingBucket =
  | "current"
  | "d1_30"
  | "d31_60"
  | "d61_90"
  | "d90_plus";

/**
 * Map a bill age (in calendar days past its due date) to an aging bucket.
 * age <= 0 means not yet overdue (or due today) → "current".
 */
export function bucketForAge(age: number): AgingBucket {
  if (age <= 0) return "current";
  if (age <= 30) return "d1_30";
  if (age <= 60) return "d31_60";
  if (age <= 90) return "d61_90";
  return "d90_plus";
}

interface BucketAmounts {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
}

export interface AgingTenantRow extends BucketAmounts {
  tenant_id: string | null;
  tenant_name: string;
  location_name: string | null;
  total: number;
}

export interface AgingReport {
  tenants: AgingTenantRow[];
  totals: BucketAmounts & { total: number };
}

function emptyBuckets(): BucketAmounts {
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
}

function decToNumber(d: Prisma.Decimal): number {
  return d.toNumber();
}

/**
 * Accounts-receivable aging report. Read-only.
 *
 * Groups outstanding bill balances by tenant and by how overdue they are
 * relative to `asOf` (defaults to now). Optionally filters to a single
 * location.
 */
export async function getAgingReport(
  locationId?: number | null,
  asOf?: Date
): Promise<AgingReport> {
  const now = asOf ?? new Date();

  const bills = await prisma.bill.findMany({
    where:
      locationId != null
        ? { bookings: { rooms: { location_id: locationId } } }
        : undefined,
    include: {
      bill_item: true,
      paymentBills: true,
      bookings: {
        include: {
          tenants: true,
          rooms: { include: { locations: true } },
        },
      },
    },
  });

  // Aggregate per tenant. Key by tenant id; fall back to a stable key for
  // bills whose booking has no tenant.
  const rowsByKey = new Map<string, AgingTenantRow>();
  const totals: BucketAmounts & { total: number } = {
    ...emptyBuckets(),
    total: 0,
  };

  for (const bill of bills) {
    const itemsTotal = bill.bill_item.reduce(
      (sum, item) => sum.add(item.amount),
      new Prisma.Decimal(0)
    );
    const paidTotal = bill.paymentBills.reduce(
      (sum, pb) => sum.add(pb.amount),
      new Prisma.Decimal(0)
    );
    const outstanding = decToNumber(itemsTotal.sub(paidTotal));

    if (outstanding <= 0) continue;

    const age = differenceInCalendarDays(now, bill.due_date);
    const bucket = bucketForAge(age);

    const tenant = bill.bookings.tenants;
    const location = bill.bookings.rooms?.locations ?? null;
    const tenantId = tenant?.id ?? null;
    const key = tenantId ?? "__no_tenant__";

    let row = rowsByKey.get(key);
    if (!row) {
      row = {
        tenant_id: tenantId,
        tenant_name: tenant?.name ?? "(Tanpa Penyewa)",
        location_name: location?.name ?? null,
        ...emptyBuckets(),
        total: 0,
      };
      rowsByKey.set(key, row);
    }

    row[bucket] += outstanding;
    row.total += outstanding;
    totals[bucket] += outstanding;
    totals.total += outstanding;
  }

  const tenants = Array.from(rowsByKey.values()).sort((a, b) =>
    a.tenant_name.localeCompare(b.tenant_name, "id-ID")
  );

  return { tenants, totals };
}
