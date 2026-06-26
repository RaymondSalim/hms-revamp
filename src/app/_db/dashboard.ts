import { prisma } from "@/app/_lib/prisma";
import { businessToday } from "@/app/_lib/util/business-time";
import { BOOKING_STATUS } from "@/app/_lib/util/status";

export async function getCheckInOutCounts(locationId: number) {
  // event_date is a @db.Date at midnight UTC; compare against the business
  // calendar day (also midnight UTC) so counts reflect the correct WIB day.
  const today = businessToday();
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const checkIns = await prisma.checkInOutLog.count({
    where: {
      event_type: "CHECK_IN",
      event_date: { gte: today, lt: tomorrow },
      bookings: { rooms: { location_id: locationId }, deletedAt: null },
    },
  });
  const checkOuts = await prisma.checkInOutLog.count({
    where: {
      event_type: "CHECK_OUT",
      event_date: { gte: today, lt: tomorrow },
      bookings: { rooms: { location_id: locationId }, deletedAt: null },
    },
  });
  return { checkIns, checkOuts };
}

export async function getRoomStats(locationId: number) {
  const rooms = await prisma.room.findMany({
    where: { location_id: locationId },
    include: { roomstatuses: true },
  });
  const available = rooms.filter(
    (r) => r.roomstatuses?.status === "Available"
  ).length;
  const occupied = rooms.filter(
    (r) => r.roomstatuses?.status === "Occupied"
  ).length;
  const maintenance = rooms.filter(
    (r) => r.roomstatuses?.status === "Maintenance"
  ).length;
  return { total: rooms.length, available, occupied, maintenance };
}

// P3-2: Occupancy rate at a point in time.
// "Occupied on asOf" = a room in the location with at least one ACTIVE booking
// (status_id = 2) whose start_date <= asOf and (end_date is null OR end_date >= asOf).
// We count only ACTIVE bookings: this is the cleanest "currently occupied"
// definition. PENDING (not yet started) and CANCELLED/COMPLETED bookings are
// excluded. start_date/end_date are @db.Date (midnight UTC), so direct Prisma
// lte/gte comparisons are TZ-safe under TZ=UTC.
export async function getOccupancyRate(locationId: number, asOf?: Date) {
  const now = asOf ?? businessToday();

  const rooms = await prisma.room.findMany({
    where: { location_id: locationId },
    select: { id: true },
  });
  const totalRooms = rooms.length;
  const roomIds = new Set(rooms.map((r) => r.id));

  if (totalRooms === 0) {
    return { totalRooms: 0, occupiedRooms: 0, rate: 0 };
  }

  const bookings = await prisma.booking.findMany({
    where: {
      status_id: BOOKING_STATUS.ACTIVE,
      start_date: { lte: now },
      OR: [{ end_date: null }, { end_date: { gte: now } }],
      rooms: { location_id: locationId },
      deletedAt: null,
    },
    select: { room_id: true },
  });

  const occupiedRoomIds = new Set<number>();
  for (const b of bookings) {
    if (b.room_id != null && roomIds.has(b.room_id)) {
      occupiedRoomIds.add(b.room_id);
    }
  }
  const occupiedRooms = occupiedRoomIds.size;
  const rate = Math.round((occupiedRooms / totalRooms) * 1000) / 10;

  return { totalRooms, occupiedRooms, rate };
}

export async function getRecentPayments(locationId: number, limit = 5) {
  return prisma.payment.findMany({
    where: { bookings: { rooms: { location_id: locationId } }, deletedAt: null },
    include: {
      bookings: { include: { tenants: true, rooms: true } },
      paymentstatuses: true,
    },
    orderBy: { payment_date: "desc" },
    take: limit,
  });
}

export async function getUpcomingEvents(limit = 5) {
  return prisma.event.findMany({
    where: { start: { gte: new Date() } },
    orderBy: { start: "asc" },
    take: limit,
  });
}

export async function getRecentTransactions(locationId: number, limit = 10) {
  return prisma.transaction.findMany({
    where: { location_id: locationId, deletedAt: null },
    orderBy: { date: "desc" },
    take: limit,
  });
}

// BL-028: Grouping logic for financial chart
export async function getGroupedIncomeExpense(params: {
  locationId: number;
  startDate: Date;
  endDate: Date;
  splitDeposit?: boolean;
}) {
  const { locationId, startDate, endDate, splitDeposit } = params;
  const diffDays =
    (endDate.getTime() - startDate.getTime()) / 86400000;
  const groupBy = diffDays < 90 ? "day" : "month";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereClause: any = {
    location_id: locationId,
    date: { gte: startDate, lte: endDate },
    deletedAt: null,
  };

  if (splitDeposit) {
    whereClause.category = { not: "Deposit" };
  }

  const transactions = await prisma.transaction.findMany({
    where: whereClause,
    orderBy: { date: "asc" },
  });

  const depositTransactions = splitDeposit
    ? await prisma.transaction.findMany({
        where: {
          location_id: locationId,
          date: { gte: startDate, lte: endDate },
          category: "Deposit",
          deletedAt: null,
        },
        orderBy: { date: "asc" },
      })
    : [];

  return { transactions, depositTransactions, groupBy };
}
