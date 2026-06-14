import { prisma } from "@/app/_lib/prisma";
import { TransactionType } from "@prisma/client";

export async function getTransactionsByLocation(locationId: number, startDate?: Date, endDate?: Date) {
  return prisma.transaction.findMany({
    where: {
      location_id: locationId,
      deletedAt: null,
      ...(startDate && endDate && { date: { gte: startDate, lte: endDate } }),
    },
    orderBy: { date: "desc" },
  });
}

export async function createTransaction(data: {
  amount: number; description: string; date: Date; category?: string;
  type: TransactionType; location_id: number; related_id?: any;
}) {
  return prisma.transaction.create({ data });
}

export async function deleteTransactionsByPayment(paymentId: number) {
  return prisma.transaction.deleteMany({
    where: { related_id: { path: ["payment_id"], equals: paymentId } },
  });
}

export async function getTransactionsByDepositId(depositId: number) {
  return prisma.transaction.findMany({
    where: { related_id: { path: ["deposit_id"], equals: depositId }, type: "INCOME", deletedAt: null },
  });
}
