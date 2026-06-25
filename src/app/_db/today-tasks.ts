import { prisma } from "@/app/_lib/prisma";
import { businessToday } from "@/app/_lib/util/business-time";
import { BOOKING_STATUS, PAYMENT_STATUS } from "@/app/_lib/util/status";
import { billOutstanding } from "@/app/_db/bills";

export interface TodayTaskCounts {
  checkInsDue: number;
  unverifiedPayments: number;
  overdueBills: number;
  expiringBookings: number;
}

/**
 * Four "needs action now" counts for the dashboard Today's Tasks panel,
 * location-scoped and WIB-correct (businessToday() returns the WIB calendar day
 * as midnight UTC, matching @db.Date storage).
 */
export async function getTodayTaskCounts(
  locationId: number
): Promise<TodayTaskCounts> {
  const today = businessToday();
  const in30 = new Date(today.getTime() + 30 * 86_400_000);

  const [checkInsDue, unverifiedPayments, overdueBillRows, expiringBookings] =
    await Promise.all([
      // Check-ins due: starts today, PENDING/ACTIVE, no CHECK_IN log yet.
      prisma.booking.count({
        where: {
          deletedAt: null,
          rooms: { location_id: locationId },
          start_date: today,
          status_id: { in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.ACTIVE] },
          checkInOutLogs: { none: { event_type: "CHECK_IN" } },
        },
      }),
      // Unverified payments: status PENDING.
      prisma.payment.count({
        where: {
          deletedAt: null,
          status_id: PAYMENT_STATUS.PENDING,
          bookings: { rooms: { location_id: locationId } },
        },
      }),
      // Overdue bills: due before today (SQL), then outstanding > 0 (JS).
      prisma.bill.findMany({
        where: {
          deletedAt: null,
          bookings: { rooms: { location_id: locationId } },
          due_date: { lt: today },
        },
        include: { bill_item: true, paymentBills: true },
      }),
      // Expiring bookings: ACTIVE, non-rolling, end_date in [today, today+30d].
      prisma.booking.count({
        where: {
          deletedAt: null,
          rooms: { location_id: locationId },
          status_id: BOOKING_STATUS.ACTIVE,
          is_rolling: false,
          end_date: { gte: today, lte: in30 },
        },
      }),
    ]);

  const overdueBills = overdueBillRows.filter(
    (b) => billOutstanding(b) > 0
  ).length;

  return { checkInsDue, unverifiedPayments, overdueBills, expiringBookings };
}
