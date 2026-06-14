import { lastDayOfUtcMonth } from "@/app/_lib/util/business-time";

// startDate/endDate are @db.Date (midnight UTC). Iterate and split by calendar
// month in UTC space so segment boundaries are independent of the server's local
// timezone.
export function splitGuestStayByMonth(startDate: Date, endDate: Date, dailyFee: number) {
  const segments: Array<{ month: number; year: number; days: number; amount: number }> = [];
  let current = new Date(startDate);

  while (current <= endDate) {
    const monthEnd = lastDayOfUtcMonth(current);
    const segmentEnd = monthEnd < endDate ? monthEnd : endDate;

    const days = Math.round((segmentEnd.getTime() - current.getTime()) / 86400000) + 1;
    const amount = days * dailyFee;

    segments.push({ month: current.getUTCMonth(), year: current.getUTCFullYear(), days, amount });

    current = new Date(segmentEnd.getTime() + 86400000);
  }

  return segments;
}
