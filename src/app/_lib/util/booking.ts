import {
  addUtcMonths,
  lastDayOfUtcMonth,
  startOfUtcDay,
  businessToday,
} from "@/app/_lib/util/business-time";

// BL-001: getLastDateOfBooking
// If start_date is 1st: end = last day of (start_month + month_count - 1)
// If start_date is NOT 1st: end = last day of (start_month + month_count)
// start_date is a @db.Date (midnight UTC); compute in UTC space so the result is
// independent of the server's local timezone.
export function getLastDateOfBooking(startDate: Date, monthCount: number): Date {
  const isFirstOfMonth = startDate.getUTCDate() === 1;
  const monthsToAdd = isFirstOfMonth ? monthCount - 1 : monthCount;
  const targetMonth = addUtcMonths(startDate, monthsToAdd);
  return lastDayOfUtcMonth(targetMonth);
}

// BL-002: isBookingActive
// Rolling: active if start_date <= today AND end_date is null
// Fixed: active if start_date <= today AND end_date >= today AND end_date is not null
export function isBookingActive(booking: {
  start_date: Date;
  end_date: Date | null;
  is_rolling: boolean;
}): boolean {
  const today = businessToday();
  const start = startOfUtcDay(booking.start_date);

  if (start > today) return false;

  if (booking.is_rolling) {
    return booking.end_date === null;
  }

  if (!booking.end_date) return false;

  const end = startOfUtcDay(booking.end_date);
  return end >= today;
}

export function getNextUpcomingBooking(bookings: Array<{
  start_date: Date;
  end_date: Date | null;
  is_rolling: boolean;
}>): typeof bookings[number] | null {
  const today = businessToday();

  const upcoming = bookings
    .filter((b) => startOfUtcDay(b.start_date) > today)
    .sort((a, b) => startOfUtcDay(a.start_date).getTime() - startOfUtcDay(b.start_date).getTime());

  return upcoming[0] || null;
}
