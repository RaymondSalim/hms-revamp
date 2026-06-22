"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import { getLastDateOfBooking } from "@/app/_lib/util/booking";
import { getIndonesianMonthName } from "@/app/_lib/util/datetime";
import { bookingSchema } from "@/app/_lib/zod/booking/zod";
import {
  businessToday,
  startOfUtcMonth,
  lastDayOfUtcMonth,
  daysInUtcMonth,
  addUtcMonths,
} from "@/app/_lib/util/business-time";
import type { DepositStatus } from "@prisma/client";
import { resolveBillingPolicy, computeTax } from "@/app/_lib/util/billing-policy";
import { roundMoney } from "@/app/_lib/util/money";
import { checkPermission } from "@/app/_lib/rbac";
import { getScopedLocationIds } from "@/app/_lib/util/location-scope";
import { logAudit } from "@/app/_lib/audit";
import { captureException } from "@/app/_lib/logger";
import { generatePaymentBillMappingFromPaymentsAndBills } from "@/app/_lib/util/payment-allocation";
import { createOrUpdatePaymentTransactions } from "@/app/(internal)/(dashboard_layout)/payments/payment-action";
import { computeExpectedStatus } from "@/app/_lib/util/booking-status";
import { BOOKING_STATUS, ROOM_STATUS } from "@/app/_lib/util/status";
import { assignInvoiceNumber } from "@/app/_lib/util/invoice-number";
import {
  generateBillsForFixedBooking,
  generateInitialBillsForRollingBooking,
  generateNextMonthlyBill,
  type BillGenerationBooking,
} from "@/app/_lib/services/bill-generation";

// --- OVERLAP DETECTION (BL-015/016) ---
async function checkOverlap(
  roomId: number,
  startDate: Date,
  endDate: Date | null,
  isRolling: boolean,
  excludeId?: number
) {
  if (isRolling) {
    // BL-015: Reject if another active rolling booking for same room without end_date
    const conflicts = await prisma.booking.findMany({
      where: {
        room_id: roomId,
        is_rolling: true,
        end_date: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (conflicts.length > 0)
      return "Kamar ini sudah memiliki pemesanan bergulir yang aktif";
  } else {
    // BL-016: Fixed overlap check
    if (!endDate) return null;
    const conflicts = await prisma.booking.findMany({
      where: {
        room_id: roomId,
        start_date: { lt: endDate },
        end_date: { gt: startDate },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (conflicts.length > 0)
      return "Terdapat pemesanan yang tumpang tindih pada kamar ini";
  }
  return null;
}

// --- UPSERT BOOKING ---
export async function upsertBookingAction(data: {
  id?: number;
  room_id: number;
  start_date: Date;
  duration_id: number | null;
  fee: number;
  tenant_id: string;
  is_rolling: boolean;
  status_id: number;
  second_resident_fee?: number | null;
  deposit_amount?: number;
  addon_ids?: Array<{ addon_id: string; start_date: Date }>;
}) {
  const { authorized } = await checkPermission("bookings.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  // Location scope guard: scoped users may only mutate bookings in their locations.
  const room = await prisma.room.findUnique({
    where: { id: data.room_id },
    select: { location_id: true },
  });
  const locationId = room?.location_id;
  const scope = await getScopedLocationIds();
  if (scope !== null && (locationId == null || !scope.includes(locationId))) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = bookingSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.flatten() };

  const startDate = new Date(data.start_date);
  let endDate: Date | null = null;

  if (!data.is_rolling && data.duration_id) {
    const duration = await prisma.duration.findUnique({
      where: { id: data.duration_id },
    });
    if (duration) {
      endDate = getLastDateOfBooking(startDate, duration.month_count);
    }
  }

  // Overlap check (BL-015/016)
  const overlapError = await checkOverlap(
    data.room_id,
    startDate,
    endDate,
    data.is_rolling,
    data.id
  );
  if (overlapError) return { success: false, error: overlapError };

  try {
    if (data.id) {
      // --- EDIT MODE (BL-032) ---
      // 1. Update booking record
      await prisma.booking.update({
        where: { id: data.id },
        data: {
          room_id: data.room_id,
          start_date: startDate,
          end_date: endDate,
          duration_id: data.duration_id,
          fee: data.fee,
          tenant_id: data.tenant_id,
          is_rolling: data.is_rolling,
          status_id: data.status_id,
          second_resident_fee: data.second_resident_fee ?? null,
        },
      });

      // 2. Preserve CREATED bill items, delete GENERATED ones
      const existingBills = await prisma.bill.findMany({
        where: { booking_id: data.id },
        include: { bill_item: true },
      });

      const createdItems = existingBills.flatMap((b) =>
        b.bill_item
          .filter((i) => i.type === "CREATED")
          .map((i) => ({ ...i, originalDueDate: b.due_date }))
      );

      // Delete all existing bills (cascades bill items via onDelete: Cascade)
      await prisma.bill.deleteMany({ where: { booking_id: data.id } });

      // 3. Update deposit if amount changed
      if (data.deposit_amount !== undefined) {
        const existingDeposit = await prisma.deposit.findUnique({
          where: { booking_id: data.id },
        });
        if (existingDeposit) {
          await prisma.deposit.update({
            where: { id: existingDeposit.id },
            data: { amount: data.deposit_amount },
          });
        } else if (data.deposit_amount > 0) {
          await prisma.deposit.create({
            data: {
              booking_id: data.id,
              amount: data.deposit_amount,
              status: "UNPAID",
            },
          });
        }
      }

      // Update booking addons
      await prisma.bookingAddOn.deleteMany({
        where: { booking_id: data.id },
      });
      if (data.addon_ids && data.addon_ids.length > 0) {
        for (const addon of data.addon_ids) {
          await prisma.bookingAddOn.create({
            data: {
              booking_id: data.id,
              addon_id: addon.addon_id,
              start_date: addon.start_date,
              is_rolling: data.is_rolling,
            },
          });
        }
      }

      // 4. Regenerate bills
      const fullBooking = await prisma.booking.findUnique({
        where: { id: data.id },
        include: {
          deposit: true,
          addOns: { include: { addOn: { include: { pricing: true } } } },
        },
      });

      if (fullBooking) {
        if (data.is_rolling) {
          await generateInitialBillsForRollingBooking(
            fullBooking as unknown as BillGenerationBooking
          );
        } else if (endDate) {
          await generateBillsForFixedBooking({
            ...(fullBooking as unknown as BillGenerationBooking),
            end_date: endDate,
          });
        }
      }

      // 5. Remap preserved CREATED items to new bills by due_date matching
      if (createdItems.length > 0) {
        const newBills = await prisma.bill.findMany({
          where: { booking_id: data.id },
          orderBy: { due_date: "asc" },
        });

        for (const item of createdItems) {
          const matchingBill = newBills.find(
            (b) => b.due_date.getTime() === item.originalDueDate.getTime()
          );
          if (matchingBill) {
            await prisma.billItem.create({
              data: {
                bill_id: matchingBill.id,
                description: item.description,
                amount: item.amount,
                internal_description: item.internal_description,
                type: "CREATED",
                related_id: item.related_id ?? undefined,
              },
            });
          }
        }
      }

      // 6. Reallocate payments after bill regeneration
      await generatePaymentBillMappingFromPaymentsAndBills(data.id);

      // 7. Rebuild transactions for all payments
      const payments = await prisma.payment.findMany({
        where: { booking_id: data.id, deletedAt: null },
      });
      for (const p of payments) {
        await createOrUpdatePaymentTransactions(p.id);
      }
    } else {
      // --- CREATE MODE ---
      // Derive status from dates: start_date <= today -> ACTIVE, else PENDING
      // (computeExpectedStatus also returns COMPLETED if a past end_date is set).
      const derivedStatus =
        computeExpectedStatus(
          {
            status_id: data.status_id,
            start_date: startDate,
            end_date: endDate,
          },
          businessToday()
        ) ?? data.status_id;

      const booking = await prisma.booking.create({
        data: {
          room_id: data.room_id,
          start_date: startDate,
          end_date: endDate,
          duration_id: data.duration_id,
          fee: data.fee,
          tenant_id: data.tenant_id,
          is_rolling: data.is_rolling,
          status_id: derivedStatus,
          second_resident_fee: data.second_resident_fee ?? null,
        },
      });

      // Create deposit if specified
      if (data.deposit_amount && data.deposit_amount > 0) {
        await prisma.deposit.create({
          data: {
            booking_id: booking.id,
            amount: data.deposit_amount,
            status: "UNPAID",
          },
        });
      }

      // Create booking addons
      if (data.addon_ids && data.addon_ids.length > 0) {
        for (const addon of data.addon_ids) {
          await prisma.bookingAddOn.create({
            data: {
              booking_id: booking.id,
              addon_id: addon.addon_id,
              start_date: addon.start_date,
              is_rolling: data.is_rolling,
            },
          });
        }
      }

      // Fetch full booking with relations for bill generation
      const fullBooking = await prisma.booking.findUnique({
        where: { id: booking.id },
        include: {
          deposit: true,
          addOns: { include: { addOn: { include: { pricing: true } } } },
        },
      });

      // Generate bills
      if (fullBooking) {
        if (data.is_rolling) {
          await generateInitialBillsForRollingBooking(
            fullBooking as unknown as BillGenerationBooking
          );
        } else if (endDate) {
          await generateBillsForFixedBooking({
            ...(fullBooking as unknown as BillGenerationBooking),
            end_date: endDate,
          });
        }
      }

      // Only mark room OCCUPIED if booking is active now (not future/pending)
      if (derivedStatus === BOOKING_STATUS.ACTIVE) {
        await prisma.room.update({
          where: { id: data.room_id },
          data: { status_id: ROOM_STATUS.OCCUPIED },
        });
      }
    }

    revalidatePath("/bookings");
    return { success: true };
  } catch (e: unknown) {
    captureException(e, { message: "Booking upsert error" });
    return { success: false, error: "Gagal menyimpan pemesanan" };
  }
}

// --- SCHEDULE END OF STAY (BL-033) ---
export async function scheduleEndOfStayAction(
  bookingId: number,
  endDate: Date
) {
  const { authorized } = await checkPermission("bookings.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  // Location scope guard: scoped users may only mutate bookings in their locations.
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { start_date: true, rooms: { select: { location_id: true } } },
  });
  const locationId = b?.rooms?.location_id;
  const scope = await getScopedLocationIds();
  if (scope !== null && (locationId == null || !scope.includes(locationId))) {
    return { success: false, error: "Unauthorized" };
  }

  if (b && endDate < b.start_date) {
    return { success: false, error: "Tanggal akhir tidak boleh sebelum tanggal mulai pemesanan" };
  }

  try {
    // 1. Generate all missing monthly bills up to the end month BEFORE setting
    // is_rolling=false (generateNextMonthlyBill guards on is_rolling).
    const fullBooking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        rooms: { include: { roomtypes: true, locations: true } },
        tenants: true,
        durations: true,
        deposit: true,
        addOns: { include: { addOn: { include: { pricing: true } } } },
        bills: { where: { deletedAt: null }, include: { bill_item: true } },
      },
    });
    if (fullBooking) {
      const endMonthEnd = lastDayOfUtcMonth(endDate);
      let cursor = startOfUtcMonth(businessToday());
      while (cursor <= endMonthEnd) {
        await generateNextMonthlyBill(
          fullBooking as unknown as BillGenerationBooking & {
            is_rolling: boolean;
            end_date: Date | null;
          },
          cursor
        );
        cursor = startOfUtcMonth(addUtcMonths(cursor, 1));
      }
    }

    // 2. Update booking: end_date=endDate, is_rolling=false
    await prisma.booking.update({
      where: { id: bookingId },
      data: { end_date: endDate, is_rolling: false },
    });

    // 3. Delete bills due AFTER the end month. We must keep the end-month bill
    // so step 3b can prorate it (the end-month bill's due_date is the last day
    // of the month, which is > endDate when ending mid-month).
    await prisma.bill.deleteMany({
      where: {
        booking_id: bookingId,
        due_date: { gt: lastDayOfUtcMonth(endDate) },
      },
    });

    // 3b. Prorate the final month's bill if ending mid-month
    const endDay = endDate.getUTCDate();
    const endMonth = endDate.getUTCMonth();
    const endYear = endDate.getUTCFullYear();
    const daysInEndMonth = daysInUtcMonth(endDate);
    const isLastDayOfMonth = endDay === daysInEndMonth;

    if (!isLastDayOfMonth) {
      // Find the bill for the end month (due_date = last day of that month)
      const lastDayDate = new Date(Date.UTC(endYear, endMonth + 1, 0));
      const finalBill = await prisma.bill.findFirst({
        where: {
          booking_id: bookingId,
          due_date: lastDayDate,
        },
        include: { bill_item: true },
      });

      if (finalBill) {
        const ratio = endDay / daysInEndMonth;

        // Prorate GENERATED items (not deposits, not tax, not CREATED items).
        // Items with related_id (deposit, tax) are skipped here.
        for (const item of finalBill.bill_item) {
          if (item.type !== "GENERATED") continue;
          if (item.related_id) continue; // Skip deposit + tax items

          const proratedAmount = roundMoney(Number(item.amount) * ratio);
          await prisma.billItem.update({
            where: { id: item.id },
            data: { amount: proratedAmount },
          });
        }

        // Recompute the PPN tax item from the now-prorated taxable subtotal
        // (P2-2). Avoids double-prorating; tax = tax_rate% of new base.
        const taxItem = finalBill.bill_item.find(
          (i) =>
            i.type === "GENERATED" &&
            i.related_id !== null &&
            typeof i.related_id === "object" &&
            (i.related_id as { tax?: boolean }).tax === true
        );
        if (taxItem) {
          const updatedItems = await prisma.billItem.findMany({
            where: { bill_id: finalBill.id },
          });
          const newSubtotal = updatedItems
            .filter(
              (i) =>
                i.type === "GENERATED" &&
                i.related_id === null &&
                i.description !== "Deposit"
            )
            .reduce((s, i) => s + Number(i.amount), 0);

          const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { rooms: true },
          });
          const policy = await resolveBillingPolicy(
            bookingId,
            booking?.rooms?.location_id ?? null
          );
          await prisma.billItem.update({
            where: { id: taxItem.id },
            data: { amount: computeTax(newSubtotal, policy.tax_rate) },
          });
        }
      }
    }

    // 4. Reallocate payments to remaining bills
    await generatePaymentBillMappingFromPaymentsAndBills(bookingId);

    // 5. Rebuild transactions for all payments
    const payments = await prisma.payment.findMany({
      where: { booking_id: bookingId, deletedAt: null },
    });
    for (const p of payments) {
      await createOrUpdatePaymentTransactions(p.id);
    }

    await logAudit(`booking.end_scheduled: id=${bookingId}, end_date=${endDate.toISOString().split("T")[0]}`);
    revalidatePath("/bookings");
    return { success: true };
  } catch (e: unknown) {
    captureException(e, { message: "Schedule end error" });
    return { success: false, error: "Gagal menjadwalkan akhir penghunian" };
  }
}

// --- CHECK IN/OUT (BL-034) ---
export async function checkInOutAction(data: {
  booking_id: number;
  event_type: "CHECK_IN" | "CHECK_OUT";
  event_date: Date;
  tenant_id: string;
  deposit_status?: DepositStatus;
  refunded_amount?: number;
}) {
  const { authorized } = await checkPermission("bookings.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  // Location scope guard: scoped users may only mutate bookings in their locations.
  const checkInOutBooking = await prisma.booking.findUnique({
    where: { id: data.booking_id },
    select: { rooms: { select: { location_id: true } } },
  });
  const locationId = checkInOutBooking?.rooms?.location_id;
  const scope = await getScopedLocationIds();
  if (scope !== null && (locationId == null || !scope.includes(locationId))) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // 1. Create CheckInOutLog record
    await prisma.checkInOutLog.create({
      data: {
        booking_id: data.booking_id,
        event_type: data.event_type,
        event_date: data.event_date,
        tenant_id: data.tenant_id,
      },
    });

    // 2. If CHECK_OUT: update booking end_date and rolling status
    if (data.event_type === "CHECK_OUT") {
      await prisma.booking.update({
        where: { id: data.booking_id },
        data: { end_date: data.event_date, is_rolling: false, status_id: BOOKING_STATUS.COMPLETED },
      });

      // Handle deposit status transition with proper validation & transactions
      if (data.deposit_status) {
        const deposit = await prisma.deposit.findUnique({
          where: { booking_id: data.booking_id },
          include: { booking: { include: { rooms: true } } },
        });

        if (deposit) {
          // Validate: can only transition from HELD
          if (deposit.status !== "HELD") {
            return {
              success: false,
              error: "Deposit hanya bisa diubah dari status HELD",
            };
          }

          const updateData: Record<string, unknown> = {
            status: data.deposit_status,
          };

          if (data.deposit_status === "APPLIED") {
            updateData.applied_at = new Date();
          }

          if (
            data.deposit_status === "REFUNDED" ||
            data.deposit_status === "PARTIALLY_REFUNDED"
          ) {
            if (!data.refunded_amount || data.refunded_amount <= 0) {
              return { success: false, error: "Jumlah refund harus diisi" };
            }
            if (
              data.deposit_status === "REFUNDED" &&
              data.refunded_amount !== Number(deposit.amount)
            ) {
              return {
                success: false,
                error: "Refund penuh harus sama dengan jumlah deposit",
              };
            }
            if (
              data.deposit_status === "PARTIALLY_REFUNDED" &&
              data.refunded_amount >= Number(deposit.amount)
            ) {
              return {
                success: false,
                error: "Refund sebagian harus kurang dari jumlah deposit",
              };
            }

            updateData.refunded_at = new Date();
            updateData.refunded_amount = data.refunded_amount;

            // Create EXPENSE transaction for refund (BL-008)
            const locationId = deposit.booking.rooms!.location_id!;
            await prisma.transaction.create({
              data: {
                amount: data.refunded_amount,
                description: "Deposit",
                date: new Date(),
                category: "Deposit",
                type: "EXPENSE",
                location_id: locationId,
                related_id: { deposit_id: deposit.id },
              },
            });
          }

          await prisma.deposit.update({
            where: { id: deposit.id },
            data: updateData,
          });
        }
      }

      // Delete future bills
      await prisma.bill.deleteMany({
        where: { booking_id: data.booking_id, due_date: { gt: data.event_date } },
      });

      // Reallocate payments to remaining bills
      await generatePaymentBillMappingFromPaymentsAndBills(data.booking_id);
      const payments = await prisma.payment.findMany({
        where: { booking_id: data.booking_id, deletedAt: null },
      });
      for (const p of payments) {
        await createOrUpdatePaymentTransactions(p.id);
      }
    }

    await logAudit(`booking.${data.event_type.toLowerCase()}: id=${data.booking_id}, date=${new Date(data.event_date).toISOString().split("T")[0]}${data.deposit_status ? `, deposit=${data.deposit_status}` : ""}`);
    revalidatePath("/bookings");
    return { success: true };
  } catch (e: unknown) {
    captureException(e, { message: "Check in/out error" });
    return { success: false, error: "Gagal mencatat check-in/out" };
  }
}

// --- DELETE BOOKING ---
export async function deleteBookingAction(id: number) {
  const { authorized } = await checkPermission("bookings.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  // Location scope guard: scoped users may only mutate bookings in their locations.
  const deleteBooking = await prisma.booking.findUnique({
    where: { id },
    select: { rooms: { select: { location_id: true } } },
  });
  const locationId = deleteBooking?.rooms?.location_id;
  const scope = await getScopedLocationIds();
  if (scope !== null && (locationId == null || !scope.includes(locationId))) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const booking = await prisma.booking.findUnique({ where: { id } });
    const roomId = booking?.room_id;

    // Soft-delete: stamp the booking and its financial sub-tree (bills,
    // payments, and the payments' transactions) so the ledger is preserved
    // for audit. All reads filter deletedAt: null, so stamped rows disappear
    // from lists and financial totals without being destroyed.
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const payments = await tx.payment.findMany({
        where: { booking_id: id },
        select: { id: true },
      });
      const paymentIds = payments.map((p) => p.id);

      for (const paymentId of paymentIds) {
        await tx.transaction.updateMany({
          where: { related_id: { path: ["payment_id"], equals: paymentId } },
          data: { deletedAt: now },
        });
      }

      await tx.payment.updateMany({
        where: { booking_id: id },
        data: { deletedAt: now },
      });
      await tx.bill.updateMany({
        where: { booking_id: id },
        data: { deletedAt: now },
      });
      await tx.booking.update({
        where: { id },
        data: { deletedAt: now },
      });
    });

    // Reset room status to AVAILABLE
    if (roomId) {
      await prisma.room.update({
        where: { id: roomId },
        data: { status_id: ROOM_STATUS.AVAILABLE },
      });
    }

    revalidatePath("/bookings");
    await logAudit(`booking.deleted: id=${id}`);
    return { success: true };
  } catch (e: unknown) {
    captureException(e, { message: "Delete booking error" });
    return { success: false, error: "Gagal menghapus pemesanan" };
  }
}
