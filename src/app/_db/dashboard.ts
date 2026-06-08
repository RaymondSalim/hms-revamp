import { prisma } from "@/app/_lib/prisma";

export async function getCheckInOutCounts(locationId: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const checkIns = await prisma.checkInOutLog.count({
    where: {
      event_type: "CHECK_IN",
      event_date: { gte: today, lt: tomorrow },
      bookings: { rooms: { location_id: locationId } },
    },
  });
  const checkOuts = await prisma.checkInOutLog.count({
    where: {
      event_type: "CHECK_OUT",
      event_date: { gte: today, lt: tomorrow },
      bookings: { rooms: { location_id: locationId } },
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

export async function getRecentPayments(locationId: number, limit = 5) {
  return prisma.payment.findMany({
    where: { bookings: { rooms: { location_id: locationId } } },
    include: {
      bookings: { include: { tenants: true, rooms: true } },
      paymentstatuses: true,
    },
    orderBy: { payment_date: "desc" },
    take: limit,
  });
}

export async function getOutstandingBills(locationId: number, limit = 5) {
  const bills = await prisma.bill.findMany({
    where: { bookings: { rooms: { location_id: locationId } } },
    include: {
      bill_item: true,
      paymentBills: true,
      bookings: { include: { tenants: true, rooms: true } },
    },
    orderBy: { due_date: "asc" },
  });
  return bills
    .filter((b) => {
      const total = b.bill_item.reduce((s, i) => s + Number(i.amount), 0);
      const paid = b.paymentBills.reduce((s, p) => s + Number(p.amount), 0);
      return total - paid > 0;
    })
    .slice(0, limit);
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
    where: { location_id: locationId },
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
        },
        orderBy: { date: "asc" },
      })
    : [];

  return { transactions, depositTransactions, groupBy };
}
