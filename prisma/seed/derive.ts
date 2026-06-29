import { PrismaClient, PaymentMethod } from "@prisma/client";
import {
  generateBillsForFixedBooking,
  generateInitialBillsForRollingBooking,
  type BillGenerationBooking,
} from "@/app/_lib/services/bill-generation";
import { generatePaymentBillMappingFromPaymentsAndBills } from "@/app/_lib/util/payment-allocation";
import { createOrUpdatePaymentTransactions } from "@/app/(internal)/(dashboard_layout)/payments/payment-action";
import { runLateFees } from "@/app/api/cron/late-fees/route";
import { runBookingStatusSync } from "@/app/api/cron/booking-status-sync/route";
import { PAYMENT_STATUS } from "@/app/_lib/util/status";
import { seedNow, monthsFrom } from "./anchor";
import { Rng } from "./rng";
import type { BookingSpec } from "./fixtures";

/**
 * Task 7: Real-logic financial derivation.
 *
 * For each booking (sorted by id for invoice-number determinism):
 * 1. Generate bills via the real service (generateBillsForFixedBooking or
 *    generateInitialBillsForRollingBooking).
 * 2. Create payments per `paymentIntent`.
 * 3. Run real allocation (generatePaymentBillMappingFromPaymentsAndBills).
 * 4. Derive ledger transactions (createOrUpdatePaymentTransactions) for each payment.
 *
 * Then replay the daily crons (runLateFees + runBookingStatusSync) over the whole
 * dataset — the real prod logic.
 */
export async function deriveFinancials(
  prisma: PrismaClient,
  rng: Rng,
  specs: BookingSpec[]
): Promise<void> {
  // 1. Bills — SEQUENTIAL in booking-id order (invoice-number determinism).
  const ordered = [...specs].sort((a, b) => a.bookingDbId - b.bookingDbId);

  for (const spec of ordered) {
    const booking = await loadBillGenBooking(prisma, spec.bookingDbId);
    if (spec.isRolling) {
      await generateInitialBillsForRollingBooking(booking);
    } else {
      // Cast to include end_date for fixed-term bookings (loaded from DB)
      await generateBillsForFixedBooking(
        booking as BillGenerationBooking & { end_date: Date }
      );
    }
  }

  // 2. Payments + allocation + transactions per booking (paymentIntent).
  for (const spec of ordered) {
    await seedPaymentsForBooking(prisma, rng, spec);
    await generatePaymentBillMappingFromPaymentsAndBills(spec.bookingDbId);

    // Derive transactions for each payment (only VERIFIED payments create txns)
    const payments = await prisma.payment.findMany({
      where: { booking_id: spec.bookingDbId },
    });
    for (const p of payments) {
      await createOrUpdatePaymentTransactions(p.id);
    }
  }

  // 3. Replay the daily crons over the whole dataset (real prod logic).
  await runLateFees(seedNow());
  await runBookingStatusSync();
}

/**
 * Load a booking in BillGenerationBooking shape (with addOns, deposit).
 * The brief specifies the exact query shape required by the real services.
 */
async function loadBillGenBooking(
  prisma: PrismaClient,
  bookingId: number
): Promise<BillGenerationBooking> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: {
      deposit: true,
      addOns: {
        include: {
          addOn: {
            include: {
              pricing: true,
            },
          },
        },
      },
    },
  });

  // Map to BillGenerationBooking shape
  // Include end_date for fixed-term bookings (the service needs it)
  const result: BillGenerationBooking & { end_date?: Date } = {
    id: booking.id,
    start_date: booking.start_date,
    fee: Number(booking.fee),
    second_resident_fee: booking.second_resident_fee
      ? Number(booking.second_resident_fee)
      : null,
    deposit: booking.deposit
      ? {
          id: booking.deposit.id,
          amount: Number(booking.deposit.amount),
        }
      : null,
    addOns: booking.addOns.map((ba) => ({
      start_date: ba.start_date,
      end_date: ba.end_date,
      addOn: {
        pricing: ba.addOn.pricing.map((p) => ({
          interval_start: p.interval_start,
          interval_end: p.interval_end,
          price: Number(p.price),
          is_full_payment: p.is_full_payment,
        })),
      },
    })),
  };

  if (booking.end_date) {
    result.end_date = booking.end_date;
  }

  return result;
}

/**
 * Create Payment rows (NO paymentBill) based on spec.paymentIntent.
 * The REAL allocation (generatePaymentBillMappingFromPaymentsAndBills) runs
 * afterward, so hand-creating paymentBill would double-allocate.
 */
async function seedPaymentsForBooking(
  prisma: PrismaClient,
  rng: Rng,
  spec: BookingSpec
): Promise<void> {
  // Skip payments for cancelled/future bookings
  if (spec.paymentIntent === "none") {
    return;
  }

  // Fetch bills to derive payment amounts and dates
  const bills = await prisma.bill.findMany({
    where: { booking_id: spec.bookingDbId, deletedAt: null },
    include: { bill_item: true },
    orderBy: { due_date: "asc" },
  });

  if (bills.length === 0) {
    // No bills yet — skip (shouldn't happen in Task 7, as bills are generated first)
    return;
  }

  // Total outstanding from all bills for this booking
  const outstanding = bills.reduce(
    (sum, bill) =>
      sum + bill.bill_item.reduce((s, item) => s + Number(item.amount), 0),
    0
  );

  const now = seedNow();

  switch (spec.paymentIntent) {
    case "paid": {
      // One VERIFIED payment covering the full outstanding
      // Use the first bill's due_date as payment_date (or seedNow if unavailable)
      const paymentDate = bills[0]?.due_date ?? now;
      await prisma.payment.create({
        data: {
          booking_id: spec.bookingDbId,
          amount: outstanding,
          payment_date: paymentDate,
          payment_method: PaymentMethod.BANK_TRANSFER,
          status_id: PAYMENT_STATUS.VERIFIED,
          allocation_mode: "auto",
        },
      });
      break;
    }

    case "partial": {
      // VERIFIED payment for a fraction (40-80% of outstanding)
      const fraction = rng.int(40, 80) / 100;
      const amount = Math.floor(outstanding * fraction);
      const paymentDate = bills[0]?.due_date ?? now;
      await prisma.payment.create({
        data: {
          booking_id: spec.bookingDbId,
          amount,
          payment_date: paymentDate,
          payment_method: PaymentMethod.BANK_TRANSFER,
          status_id: PAYMENT_STATUS.VERIFIED,
          allocation_mode: "auto",
        },
      });
      break;
    }

    case "overdue_unpaid": {
      // NO payment — leaves past-due bills outstanding so runLateFees creates penalties
      break;
    }

    case "pending": {
      // One PENDING payment (not allocated to transactions by real logic)
      const paymentDate = bills[0]?.due_date ?? now;
      await prisma.payment.create({
        data: {
          booking_id: spec.bookingDbId,
          amount: outstanding,
          payment_date: paymentDate,
          payment_method: PaymentMethod.BANK_TRANSFER,
          status_id: PAYMENT_STATUS.PENDING,
          allocation_mode: "auto",
        },
      });
      break;
    }

    case "rejected": {
      // One REJECTED payment
      const paymentDate = bills[0]?.due_date ?? now;
      await prisma.payment.create({
        data: {
          booking_id: spec.bookingDbId,
          amount: outstanding,
          payment_date: paymentDate,
          payment_method: PaymentMethod.BANK_TRANSFER,
          status_id: PAYMENT_STATUS.REJECTED,
          allocation_mode: "auto",
        },
      });
      break;
    }

    case "bulk": {
      // One VERIFIED payment covering multiple months at once (full outstanding across several bills)
      const paymentDate = bills[0]?.due_date ?? now;
      await prisma.payment.create({
        data: {
          booking_id: spec.bookingDbId,
          amount: outstanding,
          payment_date: paymentDate,
          payment_method: PaymentMethod.BANK_TRANSFER,
          status_id: PAYMENT_STATUS.VERIFIED,
          allocation_mode: "auto",
        },
      });
      break;
    }
  }
}
