import { prisma } from "@/app/_lib/prisma";

/**
 * A fully-resolved billing policy with all fields non-null (sensible defaults
 * applied). This is the shape consumed by bill generation and other callers.
 */
export interface ResolvedBillingPolicy {
  late_fee_type: string | null;
  late_fee_amount: number;
  grace_period_days: number;
  billing_cycle_day: number;
  proration_method: string;
  rate_escalation_percentage: number;
  rate_escalation_frequency: number | null;
  tax_rate: number;
  reminder_days_before: number;
}

/**
 * A single policy layer as stored in the DB. All fields are optional/nullable;
 * a null field means "not set at this layer" and should fall through to the
 * next layer during merge.
 */
export interface BillingPolicyLayer {
  late_fee_type?: string | null;
  late_fee_amount?: number | string | { toString(): string } | null;
  grace_period_days?: number | null;
  billing_cycle_day?: number | null;
  proration_method?: string | null;
  rate_escalation_percentage?: number | string | { toString(): string } | null;
  rate_escalation_frequency?: number | null;
  tax_rate?: number | string | { toString(): string } | null;
  reminder_days_before?: number | null;
}

const POLICY_FIELDS: Array<keyof BillingPolicyLayer> = [
  "late_fee_type",
  "late_fee_amount",
  "grace_period_days",
  "billing_cycle_day",
  "proration_method",
  "rate_escalation_percentage",
  "rate_escalation_frequency",
  "tax_rate",
  "reminder_days_before",
];

/**
 * Hardcoded fallback defaults. These preserve the application's current
 * behaviour when no policy rows exist (daily proration, no late fees, etc.).
 */
const FALLBACK_DEFAULTS: ResolvedBillingPolicy = {
  late_fee_type: null,
  late_fee_amount: 0,
  grace_period_days: 0,
  billing_cycle_day: 0,
  proration_method: "daily",
  rate_escalation_percentage: 0,
  rate_escalation_frequency: null,
  tax_rate: 0,
  reminder_days_before: 7,
};

/**
 * Pure function that merges policy layers with null-coalescing per field.
 * Layers are listed in ascending priority order, i.e. later arguments win.
 * Call as `mergePolicy(system, location, booking)` so booking > location >
 * system. A null/undefined field in a higher-priority layer falls through to
 * the next lower-priority layer.
 */
export function mergePolicy(
  ...layers: Array<BillingPolicyLayer | null | undefined>
): BillingPolicyLayer {
  const merged: BillingPolicyLayer = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const field of POLICY_FIELDS) {
      const value = layer[field];
      if (value !== null && value !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (merged as any)[field] = value;
      }
    }
  }
  return merged;
}

/**
 * Computes the PPN (Indonesian VAT) tax amount for a given taxable subtotal and
 * tax rate (as a percentage, e.g. 11 means 11%). The taxable subtotal must
 * EXCLUDE non-taxable items such as deposits and any pre-existing tax line.
 * Result is rounded to the nearest whole currency unit (IDR has no cents).
 */
export function computeTax(taxableSubtotal: number, taxRate: number): number {
  if (!taxRate || taxRate <= 0) return 0;
  return Math.round((taxableSubtotal * taxRate) / 100);
}

/**
 * Computes the late fee for an overdue bill given the resolved policy's late
 * fee type and amount. Pure function (no DB, no side effects).
 * - "flat": a fixed rupiah amount, returned as-is.
 * - "percentage": `lateFeeAmount` is a percentage (e.g. 5 means 5%) applied to
 *   the outstanding balance, rounded to the nearest whole rupiah.
 * - null/unknown: no late fee configured, returns 0.
 */
export function computeLateFee(
  outstanding: number,
  lateFeeType: string | null,
  lateFeeAmount: number
): number {
  if (lateFeeType === "flat") return lateFeeAmount;
  if (lateFeeType === "percentage") {
    return Math.round((outstanding * lateFeeAmount) / 100);
  }
  return 0;
}

/**
 * Formats a tax rate into a PPN line-item description, trimming a trailing
 * `.00` for whole-number rates (e.g. 11 -> "PPN 11%", 11.5 -> "PPN 11.5%").
 */
export function formatTaxDescription(taxRate: number): string {
  // String() already drops a trailing ".00" for whole numbers (11 -> "11"),
  // while preserving fractional rates (11.5 -> "11.5").
  return `PPN ${String(taxRate)}%`;
}

function toNumber(
  value: number | string | { toString(): string } | null | undefined,
  fallback: number
): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isNaN(n) ? fallback : n;
}

/**
 * Resolves the effective billing policy for a given booking/location using the
 * cascade: system default (location_id NULL, booking_id NULL) -> location
 * override (location_id=X, booking_id NULL) -> booking override (booking_id=X).
 * Any field still unset after merging gets a hardcoded fallback default so the
 * returned policy is fully populated. Resolution does NOT require any rows to
 * exist; with no rows it returns the fallback defaults.
 */
export async function resolveBillingPolicy(
  bookingId: number | null,
  locationId: number | null
): Promise<ResolvedBillingPolicy> {
  const systemDefault = await prisma.billingPolicy.findFirst({
    where: { location_id: null, booking_id: null },
  });

  const locationOverride = locationId
    ? await prisma.billingPolicy.findFirst({
        where: { location_id: locationId, booking_id: null },
      })
    : null;

  const bookingOverride = bookingId
    ? await prisma.billingPolicy.findFirst({
        where: { booking_id: bookingId },
      })
    : null;

  const merged = mergePolicy(systemDefault, locationOverride, bookingOverride);

  return {
    late_fee_type: merged.late_fee_type ?? FALLBACK_DEFAULTS.late_fee_type,
    late_fee_amount: toNumber(
      merged.late_fee_amount,
      FALLBACK_DEFAULTS.late_fee_amount
    ),
    grace_period_days:
      merged.grace_period_days ?? FALLBACK_DEFAULTS.grace_period_days,
    billing_cycle_day:
      merged.billing_cycle_day ?? FALLBACK_DEFAULTS.billing_cycle_day,
    proration_method:
      merged.proration_method ?? FALLBACK_DEFAULTS.proration_method,
    rate_escalation_percentage: toNumber(
      merged.rate_escalation_percentage,
      FALLBACK_DEFAULTS.rate_escalation_percentage
    ),
    rate_escalation_frequency:
      merged.rate_escalation_frequency ??
      FALLBACK_DEFAULTS.rate_escalation_frequency,
    tax_rate: toNumber(merged.tax_rate, FALLBACK_DEFAULTS.tax_rate),
    reminder_days_before:
      merged.reminder_days_before ?? FALLBACK_DEFAULTS.reminder_days_before,
  };
}
