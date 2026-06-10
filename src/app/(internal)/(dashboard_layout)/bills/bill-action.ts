"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/app/_lib/rbac";

// BL-003: Payment Auto-Allocation Simulation
export async function simulateUnpaidBillPaymentAction(
  bookingId: number,
  paymentAmount: number
) {
  const bills = await prisma.bill.findMany({
    where: { booking_id: bookingId },
    include: { bill_item: true, paymentBills: true },
    orderBy: { due_date: "asc" },
  });

  let remaining = paymentAmount;
  const allocations: Array<{
    bill_id: number;
    amount: number;
    description: string;
  }> = [];

  for (const bill of bills) {
    if (remaining <= 0) break;
    const total = bill.bill_item.reduce((s, i) => s + Number(i.amount), 0);
    const paid = bill.paymentBills.reduce((s, p) => s + Number(p.amount), 0);
    const outstanding = total - paid;
    if (outstanding <= 0) continue;

    const allocated = Math.min(remaining, outstanding);
    allocations.push({
      bill_id: bill.id,
      amount: allocated,
      description: bill.description,
    });
    remaining -= allocated;
  }

  return allocations;
}

// BL-014: Deterministic Regeneration of Payment-Bill Mappings
export async function generatePaymentBillMappingFromPaymentsAndBills(
  bookingId: number
) {
  const payments = await prisma.payment.findMany({
    where: { booking_id: bookingId },
    orderBy: { payment_date: "asc" },
  });

  const bills = await prisma.bill.findMany({
    where: { booking_id: bookingId },
    include: { bill_item: true },
    orderBy: { due_date: "asc" },
  });

  // Delete all existing payment-bill mappings for these payments
  const paymentIds = payments.map((p) => p.id);
  if (paymentIds.length > 0) {
    await prisma.paymentBill.deleteMany({
      where: { payment_id: { in: paymentIds } },
    });
  }

  // Track cumulative allocations per bill
  const billAllocated = new Map<number, number>();

  for (const payment of payments) {
    let remainingPayment = Number(payment.amount);

    for (const bill of bills) {
      if (remainingPayment <= 0) break;

      const billTotal = bill.bill_item.reduce(
        (s, i) => s + Number(i.amount),
        0
      );
      const alreadyAllocated = billAllocated.get(bill.id) || 0;
      const outstanding = billTotal - alreadyAllocated;

      if (outstanding <= 0) continue;

      const allocated = Math.min(remainingPayment, outstanding);
      await prisma.paymentBill.create({
        data: {
          payment_id: payment.id,
          bill_id: bill.id,
          amount: allocated,
        },
      });

      billAllocated.set(bill.id, alreadyAllocated + allocated);
      remainingPayment -= allocated;
    }
  }
}

// --- Bill CRUD Actions ---

export async function createBillAction(data: {
  booking_id: number;
  description: string;
  due_date: Date;
  items: Array<{
    description: string;
    amount: number;
    internal_description?: string;
  }>;
}) {
  const { authorized } = await checkPermission("bills.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  const bill = await prisma.bill.create({
    data: {
      booking_id: data.booking_id,
      description: data.description,
      due_date: new Date(data.due_date),
    },
  });

  for (const item of data.items) {
    await prisma.billItem.create({
      data: {
        bill_id: bill.id,
        description: item.description,
        amount: item.amount,
        internal_description: item.internal_description,
        type: "CREATED",
      },
    });
  }

  // Trigger payment reallocation
  await generatePaymentBillMappingFromPaymentsAndBills(data.booking_id);

  revalidatePath("/bills");
  return { success: true };
}

export async function updateBillDueDateAction(billId: number, dueDate: Date) {
  const { authorized } = await checkPermission("bills.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill) return { success: false, error: "Bill not found" };

  await prisma.bill.update({
    where: { id: billId },
    data: { due_date: new Date(dueDate) },
  });

  // Trigger reallocation (due_date order may have changed)
  await generatePaymentBillMappingFromPaymentsAndBills(bill.booking_id);

  revalidatePath("/bills");
  return { success: true };
}

export async function addBillItemAction(
  billId: number,
  item: { description: string; amount: number; internal_description?: string }
) {
  const { authorized } = await checkPermission("bills.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill) return { success: false, error: "Bill not found" };

  await prisma.billItem.create({
    data: {
      bill_id: billId,
      description: item.description,
      amount: item.amount,
      internal_description: item.internal_description,
      type: "CREATED",
    },
  });

  await generatePaymentBillMappingFromPaymentsAndBills(bill.booking_id);
  revalidatePath("/bills");
  return { success: true };
}

export async function updateBillItemAction(
  itemId: number,
  data: { description: string; amount: number; internal_description?: string }
) {
  const { authorized } = await checkPermission("bills.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  const item = await prisma.billItem.findUnique({
    where: { id: itemId },
    include: { bill: true },
  });
  if (!item) return { success: false, error: "Item not found" };

  await prisma.billItem.update({ where: { id: itemId }, data });
  await generatePaymentBillMappingFromPaymentsAndBills(item.bill.booking_id);
  revalidatePath("/bills");
  return { success: true };
}

export async function deleteBillItemAction(itemId: number) {
  const { authorized } = await checkPermission("bills.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  const item = await prisma.billItem.findUnique({
    where: { id: itemId },
    include: { bill: true },
  });
  if (!item) return { success: false, error: "Item not found" };

  await prisma.billItem.delete({ where: { id: itemId } });
  await generatePaymentBillMappingFromPaymentsAndBills(item.bill.booking_id);
  revalidatePath("/bills");
  return { success: true };
}

// BL-026: Get unpaid bills due within 7 days for email reminders
export async function getUnpaidBillsDueAction(targetDate: Date) {
  const { addDays } = await import("date-fns");
  const dueWindow = addDays(targetDate, 7);

  const bills = await prisma.bill.findMany({
    where: { due_date: { gte: targetDate, lte: dueWindow } },
    include: {
      bill_item: true,
      paymentBills: true,
      bookings: {
        include: { tenants: true, rooms: { include: { locations: true } } },
      },
    },
  });

  return bills.filter((bill) => {
    const total = bill.bill_item.reduce((s, i) => s + Number(i.amount), 0);
    const paid = bill.paymentBills.reduce((s, p) => s + Number(p.amount), 0);
    return total - paid > 0 && bill.bookings.tenants?.email;
  });
}
