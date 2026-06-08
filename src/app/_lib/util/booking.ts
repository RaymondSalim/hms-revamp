import { addMonths, lastDayOfMonth } from "date-fns";

// BL-001: getLastDateOfBooking
// If start_date is 1st: end = last day of (start_month + month_count - 1)
// If start_date is NOT 1st: end = last day of (start_month + month_count)
export function getLastDateOfBooking(startDate: Date, monthCount: number): Date {
  const isFirstOfMonth = startDate.getDate() === 1;
  const monthsToAdd = isFirstOfMonth ? monthCount - 1 : monthCount;
  const targetMonth = addMonths(startDate, monthsToAdd);
  return lastDayOfMonth(targetMonth);
}

// BL-002: isBookingActive
// Rolling: active if start_date <= today AND end_date is null
// Fixed: active if start_date <= today AND end_date >= today AND end_date is not null
export function isBookingActive(booking: {
  start_date: Date;
  end_date: Date | null;
  is_rolling: boolean;
}): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(booking.start_date);
  start.setHours(0, 0, 0, 0);

  if (start > today) return false;

  if (booking.is_rolling) {
    return booking.end_date === null;
  }

  if (!booking.end_date) return false;

  const end = new Date(booking.end_date);
  end.setHours(0, 0, 0, 0);
  return end >= today;
}

export function getNextUpcomingBooking(bookings: Array<{
  start_date: Date;
  end_date: Date | null;
  is_rolling: boolean;
}>): typeof bookings[number] | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = bookings
    .filter((b) => new Date(b.start_date) > today)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

  return upcoming[0] || null;
}
