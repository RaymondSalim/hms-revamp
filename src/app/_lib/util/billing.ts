// BL-017: Addon pricing tier logic
// Determines the charge for an addon at a specific month index based on pricing tiers.
export function getAddonChargeForMonth(
  pricing: Array<{
    interval_start: number;
    interval_end: number | null;
    price: number;
    is_full_payment: boolean;
  }>,
  monthIndex: number
): number {
  const tier = pricing.find(
    (p) =>
      p.interval_start <= monthIndex &&
      (p.interval_end === null || p.interval_end >= monthIndex)
  );
  if (!tier) return 0;
  if (tier.is_full_payment) {
    return monthIndex === tier.interval_start ? tier.price : 0;
  }
  return tier.price;
}
