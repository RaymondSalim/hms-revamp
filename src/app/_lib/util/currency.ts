// BL-019: Currency formatting
// IDR with no decimal places, Indonesian locale (Rp1.500.000)
// NaN returns "-"
export function formatCurrency(amount: number | string | null | undefined): string {
  const num = Number(amount);
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}
