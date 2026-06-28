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

export type ActionQueueKind = "payment" | "bill" | "checkin" | "expiring";

export interface ActionQueueItem {
  kind: ActionQueueKind;
  id: number;
  primary: string;
  secondary: string;
  bookingId: number;
  tenantId: string;
  href: string;
  canEmail?: boolean;
}

export interface ActionQueue {
  payments: ActionQueueItem[];
  bills: ActionQueueItem[];
  checkins: ActionQueueItem[];
  expiring: ActionQueueItem[];
}

const QUEUE_TAKE = 5;

function roomTenantLabel(
  roomNumber: string | undefined,
  tenantName: string | undefined
): string {
  return `Kamar ${roomNumber ?? "?"} · ${tenantName ?? "?"}`;
}

/** Format a @db.Date (midnight-UTC) as a WIB-correct calendar day. */
function fmtDate(d: Date): string {
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Top-N actionable items behind the Today's Tasks counts, for the dashboard
 * "Perlu Tindakan" panel. Reuses getTodayTaskCounts' predicates verbatim but
 * selects the items (capped at QUEUE_TAKE per category) instead of counting.
 */
export async function getActionQueue(locationId: number): Promise<ActionQueue> {
  const today = businessToday();
  const in30 = new Date(today.getTime() + 30 * 86_400_000);

  const [paymentRows, overdueBillRows, checkinRows, expiringRows] =
    await Promise.all([
      prisma.payment.findMany({
        where: {
          deletedAt: null,
          status_id: PAYMENT_STATUS.PENDING,
          bookings: { rooms: { location_id: locationId } },
        },
        include: {
          bookings: { include: { tenants: true, rooms: true } },
        },
        orderBy: { payment_date: "asc" },
        take: QUEUE_TAKE,
      }),
      // Overdue bills: due before today (SQL), outstanding > 0 (JS), then cap.
      prisma.bill.findMany({
        where: {
          deletedAt: null,
          bookings: { rooms: { location_id: locationId } },
          due_date: { lt: today },
        },
        include: {
          bill_item: true,
          paymentBills: true,
          bookings: { include: { tenants: true, rooms: true } },
        },
        orderBy: { due_date: "asc" },
      }),
      prisma.booking.findMany({
        where: {
          deletedAt: null,
          rooms: { location_id: locationId },
          start_date: today,
          status_id: { in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.ACTIVE] },
          checkInOutLogs: { none: { event_type: "CHECK_IN" } },
        },
        include: { tenants: true, rooms: true },
        orderBy: { id: "asc" },
        take: QUEUE_TAKE,
      }),
      prisma.booking.findMany({
        where: {
          deletedAt: null,
          rooms: { location_id: locationId },
          status_id: BOOKING_STATUS.ACTIVE,
          is_rolling: false,
          end_date: { gte: today, lte: in30 },
        },
        include: { tenants: true, rooms: true },
        orderBy: { end_date: "asc" },
        take: QUEUE_TAKE,
      }),
    ]);

  const payments: ActionQueueItem[] = paymentRows.map((p) => ({
    kind: "payment",
    id: p.id,
    primary: roomTenantLabel(p.bookings.rooms?.room_number, p.bookings.tenants?.name),
    secondary: `Rp${Number(p.amount).toLocaleString("id-ID")}`,
    bookingId: p.booking_id,
    tenantId: p.bookings.tenants?.id ?? "",
    href: "/payments?status=pending",
  }));

  const bills: ActionQueueItem[] = overdueBillRows
    .filter((b) => billOutstanding(b) > 0)
    .slice(0, QUEUE_TAKE)
    .map((b) => ({
      kind: "bill",
      id: b.id,
      primary: roomTenantLabel(b.bookings.rooms?.room_number, b.bookings.tenants?.name),
      secondary: `Jatuh tempo ${fmtDate(b.due_date)}`,
      bookingId: b.booking_id,
      tenantId: b.bookings.tenants?.id ?? "",
      href: "/bills?overdue=1",
      canEmail: Boolean(b.bookings.tenants?.email),
    }));

  const checkins: ActionQueueItem[] = checkinRows.map((bk) => ({
    kind: "checkin",
    id: bk.id,
    primary: roomTenantLabel(bk.rooms?.room_number, bk.tenants?.name),
    secondary: `Mulai ${fmtDate(bk.start_date)}`,
    bookingId: bk.id,
    tenantId: bk.tenant_id ?? "",
    href: "/bookings?checkin=today",
  }));

  const expiring: ActionQueueItem[] = expiringRows.map((bk) => ({
    kind: "expiring",
    id: bk.id,
    primary: roomTenantLabel(bk.rooms?.room_number, bk.tenants?.name),
    secondary: bk.end_date ? `Berakhir ${fmtDate(bk.end_date)}` : "",
    bookingId: bk.id,
    tenantId: bk.tenant_id ?? "",
    href: "/bookings?expiring=1",
  }));

  return { payments, bills, checkins, expiring };
}
