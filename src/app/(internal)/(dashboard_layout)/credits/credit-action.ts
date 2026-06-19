"use server";

import { prisma } from "@/app/_lib/prisma";
import { checkPermission } from "@/app/_lib/rbac";
import { logAudit } from "@/app/_lib/audit";
import { roundMoney } from "@/app/_lib/util/money";
import {
  getScopedLocationIds,
  isLocationInScope,
} from "@/app/_lib/util/location-scope";
import { revalidatePath } from "next/cache";

/**
 * Derive the available (unrefunded) overpayment credit for a booking.
 *
 * Available credit is NOT stored as a mutable counter. It is derived purely from
 * CREDIT-type transactions: positive "Kelebihan Bayar" rows created for the
 * booking's payments (the overpayment liability) plus negative refund rows
 * tagged with credit_refund (which draw the liability back down). Both legs are
 * CREDIT so a refund stays inside the liability account and never touches the
 * income/expense P&L.
 */
export async function getAvailableCredit(bookingId: number): Promise<number> {
  const { authorized } = await checkPermission("payments.view");
  if (!authorized) return 0;

  // A scoped user must not see credit for bookings outside their locations.
  // Return 0 (as if no credit) rather than throwing, since this feeds UI totals.
  const scopeBooking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { rooms: { select: { location_id: true } } },
  });
  const scopeLocationId = scopeBooking?.rooms?.location_id ?? null;
  const scope = await getScopedLocationIds();
  if (scopeLocationId == null || !isLocationInScope(scope, scopeLocationId)) {
    return 0;
  }

  const payments = await prisma.payment.findMany({
    where: { booking_id: bookingId, deletedAt: null },
    select: { id: true },
  });
  const paymentIds = new Set(payments.map((p) => p.id));

  // Net all CREDIT transactions for this booking: overpayments (positive,
  // tagged payment_id) net of refunds (negative, tagged booking_id +
  // credit_refund).
  const creditTransactions = await prisma.transaction.findMany({
    where: { type: "CREDIT", deletedAt: null },
  });
  const net = creditTransactions.reduce((sum, t) => {
    const related = t.related_id as
      | { payment_id?: number; booking_id?: number; credit_refund?: boolean }
      | null;
    if (!related) return sum;
    const isOverpayment =
      typeof related.payment_id === "number" &&
      paymentIds.has(related.payment_id);
    const isRefund =
      related.booking_id === bookingId && related.credit_refund === true;
    if (isOverpayment || isRefund) {
      return sum + Number(t.amount);
    }
    return sum;
  }, 0);

  return net > 0 ? roundMoney(net) : 0;
}

/**
 * Refund overpayment credit back to a departing tenant.
 *
 * Records a NEGATIVE CREDIT transaction tagged with credit_refund. Because the
 * original overpayment is a CREDIT (liability, excluded from revenue), the
 * refund must also be a CREDIT so it reduces that liability rather than landing
 * in the P&L as an expense. getAvailableCredit nets it against the positive
 * overpayment credits.
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

  const scope = await getScopedLocationIds();
  if (!isLocationInScope(scope, locationId)) {
    return { success: false, error: "Unauthorized" };
  }

  // Negative CREDIT: draws down the overpayment liability without hitting P&L.
  await prisma.transaction.create({
    data: {
      amount: -amount,
      description: "Pengembalian Kelebihan Bayar",
      date: new Date(),
      category: "Kelebihan Bayar",
      type: "CREDIT",
      location_id: locationId,
      related_id: { booking_id: bookingId, credit_refund: true },
    },
  });

  await logAudit(`credit.refunded: booking_id=${bookingId}, amount=${amount}`);
  revalidatePath("/payments");
  return { success: true };
}
