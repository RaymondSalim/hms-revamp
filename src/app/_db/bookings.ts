import { prisma } from "@/app/_lib/prisma";
import type { LocationScope } from "@/app/_lib/util/location-scope";
import { BOOKING_STATUS } from "@/app/_lib/util/status";

export async function getBookingsByLocation(locationId: number) {
  return prisma.booking.findMany({
    where: { rooms: { location_id: locationId }, deletedAt: null },
    include: {
      rooms: { include: { roomtypes: true, locations: true } },
      tenants: true, durations: true, bookingstatuses: true, deposit: true,
      bills: { where: { deletedAt: null }, include: { bill_item: true, paymentBills: true } },
      payments: { where: { deletedAt: null }, include: { paymentBills: true, paymentstatuses: true } },
      addOns: { include: { addOn: { include: { pricing: true } } } },
      guests: { include: { GuestStay: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBookingById(id: number, scope: LocationScope) {
  return prisma.booking.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(scope === null ? {} : { rooms: { location_id: { in: scope } } }),
    },
    include: {
      rooms: { include: { roomtypes: true, locations: true } },
      tenants: true, durations: true, bookingstatuses: true, deposit: true,
      bills: { where: { deletedAt: null }, include: { bill_item: true, paymentBills: true }, orderBy: { due_date: "asc" } },
      payments: { where: { deletedAt: null }, include: { paymentBills: true, paymentstatuses: true }, orderBy: { payment_date: "asc" } },
      addOns: { include: { addOn: { include: { pricing: true } } } },
      guests: { include: { GuestStay: true } },
      checkInOutLogs: true,
      penalties: true,
    },
  });
}

export async function getActiveRollingBookings() {
  return prisma.booking.findMany({
    where: { is_rolling: true, end_date: null, status_id: BOOKING_STATUS.ACTIVE, deletedAt: null },
    include: {
      rooms: { include: { roomtypes: true, locations: true } },
      tenants: true, deposit: true,
      addOns: { include: { addOn: { include: { pricing: true } } } },
      bills: { where: { deletedAt: null }, include: { bill_item: true } },
    },
  });
}
