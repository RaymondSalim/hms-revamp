// Money helpers. Amounts are Indonesian Rupiah (IDR), which has no sub-unit in
// practice, so monetary results are rounded to the nearest whole rupiah. The
// DB stores money as Decimal(10,2); writing already-rounded integers keeps
// stored values exact and prevents fractional-cent drift from accumulating
// across proration, tax, and payment-allocation arithmetic.

export function roundMoney(amount: number): number {
  return Math.round(amount);
}

// Prorate a monthly amount for a partial first month: the tenant is charged for
// the days from `startDay` through the end of the month, inclusive. Result is
// rounded to whole rupiah.
export function prorateFromStartDay(
  amount: number,
  startDay: number,
  daysInMonth: number
): number {
  return roundMoney(((daysInMonth - startDay + 1) / daysInMonth) * amount);
}

// Apply compounding rent escalation to a base monthly amount. The rate steps up
// by `percentage`% every `frequency` months of tenancy: at billing month index
// `monthIndex` (0-based) there have been floor(monthIndex / frequency) steps, so
// the amount is `base * (1 + percentage/100) ^ steps`. Returns the base amount
// unchanged when escalation is not configured (percentage <= 0 or no frequency).
export function applyRateEscalation(
  baseAmount: number,
  monthIndex: number,
  percentage: number,
  frequency: number | null
): number {
  if (!percentage || percentage <= 0 || !frequency || frequency <= 0) {
    return baseAmount;
  }
  const steps = Math.floor(monthIndex / frequency);
  if (steps <= 0) return baseAmount;
  return roundMoney(baseAmount * Math.pow(1 + percentage / 100, steps));
}
