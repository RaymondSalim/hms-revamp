import { prisma } from "@/app/_lib/prisma";
import type { LocationScope } from "@/app/_lib/util/location-scope";

export async function getPaymentsByBooking(bookingId: number) {
  return prisma.payment.findMany({
    where: { booking_id: bookingId },
    include: { paymentBills: true, paymentstatuses: true },
    orderBy: { payment_date: "asc" },
  });
}

export async function getPaymentById(id: number, scope: LocationScope = null) {
  return prisma.payment.findFirst({
    where: {
      id,
      ...(scope === null ? {} : { bookings: { rooms: { location_id: { in: scope } } } }),
    },
    include: { paymentBills: { include: { bill: { include: { bill_item: true } } } }, paymentstatuses: true, bookings: { include: { rooms: true, tenants: true } } },
  });
}

export async function createPayment(data: { booking_id: number; amount: number; payment_date: Date; payment_proof?: string; status_id?: number }) {
  return prisma.payment.create({ data });
}

export async function updatePayment(id: number, data: { amount?: number; payment_date?: Date; payment_proof?: string; status_id?: number }) {
  return prisma.payment.update({ where: { id }, data });
}

export async function deletePayment(id: number) {
  return prisma.payment.delete({ where: { id } });
}

export async function createPaymentBill(data: { payment_id: number; bill_id: number; amount: number }) {
  return prisma.paymentBill.create({ data });
}

export async function deletePaymentBillsByPayment(paymentId: number) {
  return prisma.paymentBill.deleteMany({ where: { payment_id: paymentId } });
}
