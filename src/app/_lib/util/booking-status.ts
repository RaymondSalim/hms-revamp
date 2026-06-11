import { startOfDay, isBefore } from "date-fns";

/**
 * BookingStatus id reference:
 *   1 = PENDING, 2 = ACTIVE, 3 = COMPLETED, 4 = CANCELLED
 */
export const BOOKING_STATUS = {
  PENDING: 1,
  ACTIVE: 2,
  COMPLETED: 3,
  CANCELLED: 4,
} as const;

/**
 * Compute the status_id a booking SHOULD have based on its dates.
 *
 * IMPORTANT: This function must NOT be called for CANCELLED bookings — callers
 * are expected to skip them entirely. CANCELLED is a terminal state and is
 * never auto-changed. If called for a cancelled booking, the current status is
 * returned unchanged (so a comparing caller would see "no change").
 *
 * Logic for non-cancelled bookings:
 *   - end_date set AND end_date < today (stay fully ended) -> COMPLETED (3)
 *   - else start_date <= today -> ACTIVE (2)
 *   - else (future start)      -> PENDING (1)
 *
 * Dates are compared by calendar day (start-of-day), not time. start_date /
 * end_date are `@db.Date` columns and come back as midnight-UTC Date objects.
 */
export function computeExpectedStatus(
  booking: {
    status_id: number | null;
    start_date: Date;
    end_date: Date | null;
  },
  today: Date
): number | null {
  // Terminal state — never auto-change. Return current so callers see no diff.
  if (booking.status_id === BOOKING_STATUS.CANCELLED) {
    return booking.status_id;
  }

  const todayStart = startOfDay(today);
  const startStart = startOfDay(booking.start_date);

  if (booking.end_date) {
    const endStart = startOfDay(booking.end_date);
    // Stay has fully ended (end day strictly before today).
    if (isBefore(endStart, todayStart)) {
      return BOOKING_STATUS.COMPLETED;
    }
  }

  // start_date <= today -> ACTIVE, else future -> PENDING.
  if (!isBefore(todayStart, startStart)) {
    return BOOKING_STATUS.ACTIVE;
  }

  return BOOKING_STATUS.PENDING;
}
