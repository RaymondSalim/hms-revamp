import { lastDayOfMonth } from "date-fns";

export function splitGuestStayByMonth(startDate: Date, endDate: Date, dailyFee: number) {
  const segments: Array<{ month: number; year: number; days: number; amount: number }> = [];
  let current = new Date(startDate);

  while (current <= endDate) {
    const monthEnd = lastDayOfMonth(current);
    const segmentEnd = monthEnd < endDate ? monthEnd : endDate;

    const days = Math.round((segmentEnd.getTime() - current.getTime()) / 86400000) + 1;
    const amount = days * dailyFee;

    segments.push({ month: current.getMonth(), year: current.getFullYear(), days, amount });

    current = new Date(segmentEnd);
    current.setDate(current.getDate() + 1);
  }

  return segments;
}
