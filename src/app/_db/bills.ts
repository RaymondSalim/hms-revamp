import { prisma } from "@/app/_lib/prisma";
import { BillType } from "@prisma/client";
import type { LocationScope } from "@/app/_lib/util/location-scope";

export async function getBillsByBooking(bookingId: number) {
  return prisma.bill.findMany({
    where: { booking_id: bookingId },
    include: { bill_item: true, paymentBills: true },
    orderBy: { due_date: "asc" },
  });
}

export async function getBillById(id: number, scope: LocationScope = null) {
  return prisma.bill.findFirst({
    where: {
      id,
      ...(scope === null ? {} : { bookings: { rooms: { location_id: { in: scope } } } }),
    },
    include: { bill_item: true, paymentBills: true, bookings: { include: { tenants: true, rooms: true } } },
  });
}

export async function createBill(data: { booking_id: number; description: string; due_date: Date }) {
  return prisma.bill.create({ data });
}

export async function createBillItem(data: {
  bill_id: number; description: string; amount: number;
  internal_description?: string; type?: BillType; related_id?: any;
}) {
  return prisma.billItem.create({ data: { ...data, amount: data.amount } });
}

export async function updateBillDueDate(id: number, dueDate: Date) {
  return prisma.bill.update({ where: { id }, data: { due_date: dueDate } });
}

export async function deleteBillsByBooking(bookingId: number) {
  return prisma.bill.deleteMany({ where: { booking_id: bookingId } });
}
