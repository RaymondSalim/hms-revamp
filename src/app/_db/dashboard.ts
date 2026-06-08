import { prisma } from "@/app/_lib/prisma";
import { TransactionType } from "@prisma/client";

export async function getCheckInOutCounts(locationId: number, date: Date) {
  const startOfDay = new Date(date); startOfDay.setHours(0,0,0,0);
  const endOfDay = new Date(date); endOfDay.setHours(23,59,59,999);

  const checkIns = await prisma.checkInOutLog.count({
    where: { event_type: "CHECK_IN", event_date: { gte: startOfDay, lte: endOfDay }, bookings: { rooms: { location_id: locationId } } },
  });
  const checkOuts = await prisma.checkInOutLog.count({
    where: { event_type: "CHECK_OUT", event_date: { gte: startOfDay, lte: endOfDay }, bookings: { rooms: { location_id: locationId } } },
  });
  return { checkIns, checkOuts };
}

export async function getRoomStats(locationId: number) {
  const rooms = await prisma.room.groupBy({ by: ["status_id"], where: { location_id: locationId }, _count: true });
  return rooms;
}

export async function getRecentPayments(locationId: number, limit = 5) {
  return prisma.payment.findMany({
    where: { bookings: { rooms: { location_id: locationId } } },
    include: { bookings: { include: { tenants: true, rooms: true } }, paymentstatuses: true },
    orderBy: { payment_date: "desc" },
    take: limit,
  });
}

export async function getRecentTransactions(locationId: number, limit = 10) {
  return prisma.transaction.findMany({
    where: { location_id: locationId },
    orderBy: { date: "desc" },
    take: limit,
  });
}
