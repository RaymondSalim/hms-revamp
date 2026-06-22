import { prisma } from "@/app/_lib/prisma";
import { getIndonesianMonthName } from "@/app/_lib/util/datetime";
import {
  businessToday,
  startOfUtcMonth,
  lastDayOfUtcMonth,
  daysInUtcMonth,
  addUtcMonths,
} from "@/app/_lib/util/business-time";
import { getAddonChargeForMonth } from "@/app/_lib/util/billing";
import {
  resolveBillingPolicy,
  computeTax,
  formatTaxDescription,
} from "@/app/_lib/util/billing-policy";
import { assignInvoiceNumber } from "@/app/_lib/util/invoice-number";
import {
  prorateFromStartDay,
  applyRateEscalation,
} from "@/app/_lib/util/money";

/**
 * Bill-generation service.
 *
 * These functions used to live in bookings/booking-action.ts. They were
 * exported from a "use server" module, which made Next.js treat each as a
 * callable server-action endpoint even though they are internal helpers (only
 * the monthly-billing cron and the booking action invoke them). Moving them
 * into a plain service module removes that unintended RPC surface and gives the
 * most business-critical logic a directly importable, unit-testable home.
 */

// --- Shared bill generation helper types ---
export interface BillGenerationBooking {
  id: number;
  start_date: Date;
  fee: number | string;
  second_resident_fee: number | string | null;
  deposit?: { id: number; amount: number | string } | null;
  addOns: Array<{
    start_date: Date;
    end_date: Date | null;
    addOn: {
      pricing: Array<{
        interval_start: number;
        interval_end: number | null;
        price: number | string;
        is_full_payment: boolean;
      }>;
    };
  }>;
}

// --- Core bill generation logic ---
async function generateBillsForRange(
  booking: BillGenerationBooking,
  endDate: Date
) {
  const startDate = new Date(booking.start_date);
  const fee = Number(booking.fee);
  const secondResidentFee = booking.second_resident_fee
    ? Number(booking.second_resident_fee)
    : null;

  // Resolve the effective billing policy once (system -> location -> booking).
  const bookingWithRoom = await prisma.booking.findUnique({
    where: { id: booking.id },
    include: { rooms: true },
  });
  const locationId = bookingWithRoom?.rooms?.location_id ?? null;
  const policy = await resolveBillingPolicy(booking.id, locationId);
  const shouldProrate = policy.proration_method !== "none";

  let current = startOfUtcMonth(startDate);
  let monthIndex = 0;
  const bills = [];

  while (current <= endDate) {
    const daysInMonth = daysInUtcMonth(current);
    const billingMonth = current.getUTCMonth();
    const billingYear = current.getUTCFullYear();
    const dueDate = lastDayOfUtcMonth(current);

    // Calculate room fee (BL-012: due_date = last day of billing month).
    // Rent escalation steps up the base fee every N months of tenancy before
    // any first-month proration is applied.
    const escalatedFee = applyRateEscalation(
      fee,
      monthIndex,
      policy.rate_escalation_percentage,
      policy.rate_escalation_frequency
    );
    let roomFee = escalatedFee;
    if (shouldProrate && monthIndex === 0 && startDate.getUTCDate() !== 1) {
      // Prorate first month: (daysInMonth - startDay + 1) / daysInMonth * fee
      roomFee = prorateFromStartDay(
        escalatedFee,
        startDate.getUTCDate(),
        daysInMonth
      );
    }

    // BL-013: description format
    const description = `Tagihan untuk Bulan ${getIndonesianMonthName(billingMonth)} ${billingYear}`;

    const bill = await prisma.bill.create({
      data: { booking_id: booking.id, description, due_date: dueDate },
    });

    // Assign sequential invoice number (skipped when location is unknown)
    await assignInvoiceNumber(bill.id, locationId, dueDate);

    // Running taxable subtotal (excludes deposit, which isn't taxed).
    let taxableSubtotal = 0;

    // Room fee bill item
    await prisma.billItem.create({
      data: {
        bill_id: bill.id,
        description: "Biaya Sewa",
        amount: roomFee,
        type: "GENERATED",
      },
    });
    taxableSubtotal += roomFee;

    // Deposit bill item (first bill only)
    if (monthIndex === 0 && booking.deposit) {
      await prisma.billItem.create({
        data: {
          bill_id: bill.id,
          description: "Deposit",
          amount: Number(booking.deposit.amount),
          type: "GENERATED",
          related_id: { deposit_id: booking.deposit.id },
        },
      });
    }

    // Second resident fee
    if (secondResidentFee && secondResidentFee > 0) {
      const escalatedSrFee = applyRateEscalation(
        secondResidentFee,
        monthIndex,
        policy.rate_escalation_percentage,
        policy.rate_escalation_frequency
      );
      let srFee = escalatedSrFee;
      if (shouldProrate && monthIndex === 0 && startDate.getUTCDate() !== 1) {
        srFee = prorateFromStartDay(
          escalatedSrFee,
          startDate.getUTCDate(),
          daysInMonth
        );
      }
      await prisma.billItem.create({
        data: {
          bill_id: bill.id,
          description: "Biaya Penghuni Kedua",
          amount: srFee,
          type: "GENERATED",
        },
      });
      taxableSubtotal += srFee;
    }

    // Addon fees (BL-017)
    for (const bookingAddon of booking.addOns) {
      const addonStart = new Date(bookingAddon.start_date);
      const addonEnd = bookingAddon.end_date
        ? new Date(bookingAddon.end_date)
        : null;

      // Skip if addon hasn't started yet or has ended
      if (current < startOfUtcMonth(addonStart)) continue;
      if (addonEnd && current > addonEnd) continue;

      // Calculate addon month index from addon start
      const addonMonthIndex =
        (billingYear - addonStart.getUTCFullYear()) * 12 +
        (billingMonth - addonStart.getUTCMonth());
      const charge = getAddonChargeForMonth(
        bookingAddon.addOn.pricing.map((p) => ({
          ...p,
          price: Number(p.price),
        })),
        addonMonthIndex
      );
      if (charge > 0) {
        // Prorate addon on first booking month if start day is not 1st
        let addonFee = charge;
        if (shouldProrate && monthIndex === 0 && startDate.getUTCDate() !== 1) {
          addonFee = prorateFromStartDay(
            charge,
            startDate.getUTCDate(),
            daysInMonth
          );
        }
        await prisma.billItem.create({
          data: {
            bill_id: bill.id,
            description: "Add-on",
            amount: addonFee,
            type: "GENERATED",
          },
        });
        taxableSubtotal += addonFee;
      }
    }

    // PPN tax line item (P2-2). Deposit is excluded from the taxable base.
    if (policy.tax_rate > 0) {
      await prisma.billItem.create({
        data: {
          bill_id: bill.id,
          description: formatTaxDescription(policy.tax_rate),
          amount: computeTax(taxableSubtotal, policy.tax_rate),
          type: "GENERATED",
          related_id: { tax: true },
        },
      });
    }

    bills.push(bill);
    current = startOfUtcMonth(addUtcMonths(current, 1));
    monthIndex++;
  }

  return bills;
}

// --- BILL GENERATION (Fixed-term) ---
export async function generateBillsForFixedBooking(
  booking: BillGenerationBooking & { end_date: Date }
) {
  const endDate = new Date(booking.end_date);
  return generateBillsForRange(booking, endDate);
}

// --- BILL GENERATION (Rolling - Initial, BL-010) ---
export async function generateInitialBillsForRollingBooking(
  booking: BillGenerationBooking
) {
  // Generate bills up to end of current month
  const today = businessToday();
  const endDate = lastDayOfUtcMonth(today);
  return generateBillsForRange(booking, endDate);
}

// --- MONTHLY CRON BILL (BL-011) ---
export async function generateNextMonthlyBill(
  booking: BillGenerationBooking & {
    is_rolling: boolean;
    end_date: Date | null;
  },
  targetDate: Date
) {
  // Only for rolling bookings without end_date
  if (!booking.is_rolling || booking.end_date) return null;

  const targetMonth = targetDate.getUTCMonth();
  const targetYear = targetDate.getUTCFullYear();
  const dueDate = lastDayOfUtcMonth(targetDate);

  // Check if bill already exists for this month (IDEMPOTENT).
  // Intentionally NOT filtered by deletedAt: the @@unique([booking_id,
  // due_date]) constraint ignores soft-delete, so a soft-deleted bill for this
  // period still occupies the slot. Filtering it out here would let us attempt
  // an insert that the DB then rejects with a unique-constraint violation.
  const existingBill = await prisma.bill.findFirst({
    where: {
      booking_id: booking.id,
      due_date: dueDate,
    },
  });
  if (existingBill) return null;

  const fee = Number(booking.fee);
  const secondResidentFee = booking.second_resident_fee
    ? Number(booking.second_resident_fee)
    : null;

  // BL-013: description format
  const description = `Tagihan untuk Bulan ${getIndonesianMonthName(targetMonth)} ${targetYear}`;

  const bill = await prisma.bill.create({
    data: { booking_id: booking.id, description, due_date: dueDate },
  });

  // Assign sequential invoice number (skipped when location is unknown)
  const monthlyBookingWithRoom = await prisma.booking.findUnique({
    where: { id: booking.id },
    include: { rooms: true },
  });
  const locationId = monthlyBookingWithRoom?.rooms?.location_id ?? null;
  await assignInvoiceNumber(bill.id, locationId, dueDate);

  // Resolve the effective billing policy (system -> location -> booking) so we
  // can apply PPN tax (P2-2).
  const policy = await resolveBillingPolicy(booking.id, locationId);

  // Running taxable subtotal (no deposit on rolling monthly bills).
  let taxableSubtotal = 0;

  // Full room fee (no proration for subsequent months)
  await prisma.billItem.create({
    data: {
      bill_id: bill.id,
      description: "Biaya Sewa",
      amount: fee,
      type: "GENERATED",
    },
  });
  taxableSubtotal += fee;

  // Second resident fee (full)
  if (secondResidentFee && secondResidentFee > 0) {
    await prisma.billItem.create({
      data: {
        bill_id: bill.id,
        description: "Biaya Penghuni Kedua",
        amount: secondResidentFee,
        type: "GENERATED",
      },
    });
    taxableSubtotal += secondResidentFee;
  }

  // Addon fees for this month (BL-017)
  for (const bookingAddon of booking.addOns || []) {
    const addonStart = new Date(bookingAddon.start_date);
    const addonEnd = bookingAddon.end_date
      ? new Date(bookingAddon.end_date)
      : null;
    if (targetDate < startOfUtcMonth(addonStart)) continue;
    if (addonEnd && targetDate > addonEnd) continue;

    const addonMonthIndex =
      (targetYear - addonStart.getUTCFullYear()) * 12 +
      (targetMonth - addonStart.getUTCMonth());
    const charge = getAddonChargeForMonth(
      bookingAddon.addOn.pricing.map((p) => ({
        ...p,
        price: Number(p.price),
      })),
      addonMonthIndex
    );
    if (charge > 0) {
      await prisma.billItem.create({
        data: {
          bill_id: bill.id,
          description: "Add-on",
          amount: charge,
          type: "GENERATED",
        },
      });
      taxableSubtotal += charge;
    }
  }

  // PPN tax line item (P2-2).
  if (policy.tax_rate > 0) {
    await prisma.billItem.create({
      data: {
        bill_id: bill.id,
        description: formatTaxDescription(policy.tax_rate),
        amount: computeTax(taxableSubtotal, policy.tax_rate),
        type: "GENERATED",
        related_id: { tax: true },
      },
    });
  }

  return bill;
}
