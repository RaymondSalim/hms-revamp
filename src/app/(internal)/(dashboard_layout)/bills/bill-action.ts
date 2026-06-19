"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/app/_lib/rbac";
import { getScopedLocationIds } from "@/app/_lib/util/location-scope";
import { assignInvoiceNumber } from "@/app/_lib/util/invoice-number";
import { generatePaymentBillMappingFromPaymentsAndBills } from "@/app/_lib/util/payment-allocation";
import { sendBillReminderEmail } from "@/app/_lib/mailer";

// BL-003: Payment Auto-Allocation Simulation
export async function simulateUnpaidBillPaymentAction(
  bookingId: number,
  paymentAmount: number
) {
  const { authorized } = await checkPermission("payments.view");
  if (!authorized) return [];

  // Location scope guard: scoped users may only view bills in their locations.
  const simBooking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { rooms: { select: { location_id: true } } },
  });
  const locationId = simBooking?.rooms?.location_id;
  const scope = await getScopedLocationIds();
  if (scope !== null && (locationId == null || !scope.includes(locationId))) {
    return [];
  }

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

  // Location scope guard: scoped users may only mutate bills in their locations.
  const createBillBooking = await prisma.booking.findUnique({
    where: { id: data.booking_id },
    select: { rooms: { select: { location_id: true } } },
  });
  const locationId = createBillBooking?.rooms?.location_id;
  const scope = await getScopedLocationIds();
  if (scope !== null && (locationId == null || !scope.includes(locationId))) {
    return { success: false, error: "Unauthorized" };
  }

  const dueDate = new Date(data.due_date);
  const duplicate = await prisma.bill.findUnique({
    where: {
      booking_id_due_date: { booking_id: data.booking_id, due_date: dueDate },
    },
  });
  if (duplicate) {
    return {
      success: false,
      error: "Tagihan dengan tanggal jatuh tempo ini sudah ada untuk pemesanan tersebut",
    };
  }

  const bill = await prisma.bill.create({
    data: {
      booking_id: data.booking_id,
      description: data.description,
      due_date: dueDate,
    },
  });

  // Assign sequential invoice number (skipped when location is unknown)
  const bookingWithRoom = await prisma.booking.findUnique({
    where: { id: data.booking_id },
    include: { rooms: true },
  });
  await assignInvoiceNumber(
    bill.id,
    bookingWithRoom?.rooms?.location_id ?? null,
    new Date(data.due_date)
  );

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

  // Location scope guard: scoped users may only mutate bills in their locations.
  const billForScope = await prisma.bill.findUnique({
    where: { id: billId },
    select: { bookings: { select: { rooms: { select: { location_id: true } } } } },
  });
  const locationId = billForScope?.bookings?.rooms?.location_id;
  const scope = await getScopedLocationIds();
  if (scope !== null && (locationId == null || !scope.includes(locationId))) {
    return { success: false, error: "Unauthorized" };
  }

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

  // Location scope guard: scoped users may only mutate bills in their locations.
  const billForScope = await prisma.bill.findUnique({
    where: { id: billId },
    select: { bookings: { select: { rooms: { select: { location_id: true } } } } },
  });
  const locationId = billForScope?.bookings?.rooms?.location_id;
  const scope = await getScopedLocationIds();
  if (scope !== null && (locationId == null || !scope.includes(locationId))) {
    return { success: false, error: "Unauthorized" };
  }

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

  // Location scope guard: scoped users may only mutate bills in their locations.
  const itemForScope = await prisma.billItem.findUnique({
    where: { id: itemId },
    select: {
      bill: {
        select: { bookings: { select: { rooms: { select: { location_id: true } } } } },
      },
    },
  });
  const locationId = itemForScope?.bill?.bookings?.rooms?.location_id;
  const scope = await getScopedLocationIds();
  if (scope !== null && (locationId == null || !scope.includes(locationId))) {
    return { success: false, error: "Unauthorized" };
  }

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

  // Location scope guard: scoped users may only mutate bills in their locations.
  const itemForScope = await prisma.billItem.findUnique({
    where: { id: itemId },
    select: {
      bill: {
        select: { bookings: { select: { rooms: { select: { location_id: true } } } } },
      },
    },
  });
  const locationId = itemForScope?.bill?.bookings?.rooms?.location_id;
  const scope = await getScopedLocationIds();
  if (scope !== null && (locationId == null || !scope.includes(locationId))) {
    return { success: false, error: "Unauthorized" };
  }

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

export async function resendBillEmailAction(billId: number) {
  const { authorized } = await checkPermission("bills.manage");
  if (!authorized) return { success: false, error: "Tidak memiliki akses" };

  const scope = await getScopedLocationIds();

  const bill = await prisma.bill.findUnique({
    where: { id: billId, deletedAt: null },
    include: {
      bill_item: true,
      paymentBills: true,
      bookings: {
        include: {
          tenants: true,
          rooms: { include: { locations: true } },
        },
      },
    },
  });

  if (!bill) return { success: false, error: "Tagihan tidak ditemukan" };

  const locationId = bill.bookings.rooms?.location_id;
  if (scope !== null && (locationId == null || !scope.includes(locationId))) {
    return { success: false, error: "Tidak memiliki akses" };
  }

  if (!bill.bookings.tenants?.email) {
    return { success: false, error: "Penyewa tidak memiliki alamat email" };
  }

  try {
    await sendBillReminderEmail(bill);
    return { success: true };
  } catch {
    return { success: false, error: "Gagal mengirim email. Silakan coba lagi." };
  }
}
