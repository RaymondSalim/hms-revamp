import { prisma } from "@/app/_lib/prisma";

export async function getBookingsByLocation(locationId: number) {
  return prisma.booking.findMany({
    where: { rooms: { location_id: locationId } },
    include: {
      rooms: { include: { roomtypes: true, locations: true } },
      tenants: true, durations: true, bookingstatuses: true, deposit: true,
      bills: { include: { bill_item: true, paymentBills: true } },
      payments: { include: { paymentBills: true, paymentstatuses: true } },
      addOns: { include: { addOn: { include: { pricing: true } } } },
      guests: { include: { GuestStay: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBookingById(id: number) {
  return prisma.booking.findUnique({
    where: { id },
    include: {
      rooms: { include: { roomtypes: true, locations: true } },
      tenants: true, durations: true, bookingstatuses: true, deposit: true,
      bills: { include: { bill_item: true, paymentBills: true }, orderBy: { due_date: "asc" } },
      payments: { include: { paymentBills: true, paymentstatuses: true }, orderBy: { payment_date: "asc" } },
      addOns: { include: { addOn: { include: { pricing: true } } } },
      guests: { include: { GuestStay: true } },
      checkInOutLogs: true,
      penalties: true,
    },
  });
}

export async function getActiveRollingBookings() {
  return prisma.booking.findMany({
    where: { is_rolling: true, end_date: null, status_id: 2 },
    include: {
      rooms: { include: { roomtypes: true, locations: true } },
      tenants: true, deposit: true,
      addOns: { include: { addOn: { include: { pricing: true } } } },
      bills: { include: { bill_item: true } },
    },
  });
}
