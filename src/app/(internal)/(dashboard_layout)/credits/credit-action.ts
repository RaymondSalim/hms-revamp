"use server";

import { prisma } from "@/app/_lib/prisma";
import { checkPermission } from "@/app/_lib/rbac";
import { logAudit } from "@/app/_lib/audit";
import { revalidatePath } from "next/cache";

/**
 * Derive the available (unrefunded) overpayment credit for a booking.
 *
 * Available credit is NOT stored as a mutable counter. It is derived by summing
 * CREDIT transactions ("Kelebihan Bayar") created for the booking's payments and
 * subtracting any credit refunds (EXPENSE transactions tagged with credit_refund).
 */
export async function getAvailableCredit(bookingId: number): Promise<number> {
  const payments = await prisma.payment.findMany({
    where: { booking_id: bookingId },
    select: { id: true },
  });
  const paymentIds = new Set(payments.map((p) => p.id));

  // Sum CREDIT transactions belonging to this booking's payments.
  const creditTransactions = await prisma.transaction.findMany({
    where: { type: "CREDIT" },
  });
  const creditTotal = creditTransactions.reduce((sum, t) => {
    const related = t.related_id as { payment_id?: number } | null;
    if (related && typeof related.payment_id === "number" && paymentIds.has(related.payment_id)) {
      return sum + Number(t.amount);
    }
    return sum;
  }, 0);

  // Subtract refunds for this booking (EXPENSE transactions tagged credit_refund).
  const refundTransactions = await prisma.transaction.findMany({
    where: { type: "EXPENSE" },
  });
  const refundTotal = refundTransactions.reduce((sum, t) => {
    const related = t.related_id as
      | { booking_id?: number; credit_refund?: boolean }
      | null;
    if (related && related.booking_id === bookingId && related.credit_refund === true) {
      return sum + Number(t.amount);
    }
    return sum;
  }, 0);

  const net = creditTotal - refundTotal;
  return net > 0 ? net : 0;
}

/**
 * Refund overpayment credit back to a departing tenant.
 *
 * Creates an EXPENSE transaction tagged with credit_refund so getAvailableCredit
 * deducts it from the derived balance.
 */
export async function refundCreditAction(
  bookingId: number,
  amount: number,
): Promise<{ success: boolean; error?: string }> {
  const { authorized } = await checkPermission("payments.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  if (amount <= 0) {
    return { success: false, error: "Jumlah harus lebih dari 0" };
  }

  const available = await getAvailableCredit(bookingId);
  if (amount > available) {
    return {
      success: false,
      error: "Jumlah melebihi kelebihan bayar yang tersedia",
    };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { rooms: true },
  });
  const locationId = booking?.rooms?.location_id;
  if (!locationId) {
    return { success: false, error: "Lokasi tidak ditemukan" };
  }

  await prisma.transaction.create({
    data: {
      amount,
      description: "Pengembalian Kelebihan Bayar",
      date: new Date(),
      category: "Kelebihan Bayar",
      type: "EXPENSE",
      location_id: locationId,
      related_id: { booking_id: bookingId, credit_refund: true },
    },
  });

  await logAudit(`credit.refunded: booking_id=${bookingId}, amount=${amount}`);
  revalidatePath("/payments");
  return { success: true };
}
