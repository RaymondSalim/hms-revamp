import { prisma } from "@/app/_lib/prisma";

export async function getGuestsByBooking(bookingId: number) {
  return prisma.guest.findMany({ where: { booking_id: bookingId }, include: { GuestStay: true } });
}

export async function getGuestById(id: number) {
  return prisma.guest.findUnique({ where: { id }, include: { GuestStay: true, booking: true } });
}

export async function createGuest(data: { name: string; email?: string; phone?: string; booking_id: number }) {
  return prisma.guest.create({ data });
}

export async function updateGuest(id: number, data: { name?: string; email?: string; phone?: string }) {
  return prisma.guest.update({ where: { id }, data });
}

export async function deleteGuest(id: number) {
  return prisma.guest.delete({ where: { id } });
}

export async function createGuestStay(data: { guest_id: number; start_date: Date; end_date: Date; daily_fee: number }) {
  return prisma.guestStay.create({ data });
}

export async function deleteGuestStay(id: number) {
  return prisma.guestStay.delete({ where: { id } });
}
