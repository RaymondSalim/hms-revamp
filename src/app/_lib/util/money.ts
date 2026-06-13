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
