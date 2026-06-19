import { prisma } from "@/app/_lib/prisma";
import { DepositStatus } from "@prisma/client";

export async function getDepositByBooking(bookingId: number) {
  return prisma.deposit.findUnique({ where: { booking_id: bookingId } });
}

export async function createDeposit(data: { booking_id: number; amount: number; status: DepositStatus }) {
  return prisma.deposit.create({ data });
}

export async function updateDepositStatus(id: number, data: { status: DepositStatus; refunded_at?: Date; applied_at?: Date; refunded_amount?: number }) {
  return prisma.deposit.update({ where: { id }, data });
}

export async function updateDepositAmount(id: number, amount: number) {
  return prisma.deposit.update({ where: { id }, data: { amount } });
}
