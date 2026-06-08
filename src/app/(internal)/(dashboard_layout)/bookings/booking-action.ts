"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import { getLastDateOfBooking } from "@/app/_lib/util/booking";
import { getIndonesianMonthName } from "@/app/_lib/util/datetime";
import { bookingSchema } from "@/app/_lib/zod/booking/zod";
import { getDaysInMonth, lastDayOfMonth, addMonths, startOfMonth } from "date-fns";
import type { DepositStatus } from "@prisma/client";

// --- ADDON PRICING (BL-017) ---
function getAddonChargeForMonth(
  pricing: Array<{
    interval_start: number;
    interval_end: number | null;
    price: number;
    is_full_payment: boolean;
  }>,
  monthIndex: number
): number {
  const tier = pricing.find(
    (p) =>
      p.interval_start <= monthIndex &&
      (p.interval_end === null || p.interval_end >= monthIndex)
  );
  if (!tier) return 0;
  if (tier.is_full_payment) {
    return monthIndex === tier.interval_start ? tier.price : 0;
  }
  return tier.price;
}

// --- Shared bill generation helper types ---
interface BillGenerationBooking {
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

  let current = startOfMonth(startDate);
  let monthIndex = 0;
  const bills = [];

  while (current <= endDate) {
    const daysInMonth = getDaysInMonth(current);
    const billingMonth = current.getMonth();
    const billingYear = current.getFullYear();
    const dueDate = lastDayOfMonth(current);

    // Calculate room fee (BL-012: due_date = last day of billing month)
    let roomFee = fee;
    if (monthIndex === 0 && startDate.getDate() !== 1) {
      // Prorate first month: (daysInMonth - startDay + 1) / daysInMonth * fee
      const startDay = startDate.getDate();
      roomFee = ((daysInMonth - startDay + 1) / daysInMonth) * fee;
    }

    // BL-013: description format
    const description = `Tagihan untuk Bulan ${getIndonesianMonthName(billingMonth)} ${billingYear}`;

    const bill = await prisma.bill.create({
      data: { booking_id: booking.id, description, due_date: dueDate },
    });

    // Room fee bill item
    await prisma.billItem.create({
      data: {
        bill_id: bill.id,
        description: "Biaya Sewa",
        amount: roomFee,
        type: "GENERATED",
      },
    });

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
      let srFee = secondResidentFee;
      if (monthIndex === 0 && startDate.getDate() !== 1) {
        const startDay = startDate.getDate();
        srFee =
          ((daysInMonth - startDay + 1) / daysInMonth) * secondResidentFee;
      }
      await prisma.billItem.create({
        data: {
          bill_id: bill.id,
          description: "Biaya Penghuni Kedua",
          amount: srFee,
          type: "GENERATED",
        },
      });
    }

    // Addon fees (BL-017)
    for (const bookingAddon of booking.addOns) {
      const addonStart = new Date(bookingAddon.start_date);
      const addonEnd = bookingAddon.end_date
        ? new Date(bookingAddon.end_date)
        : null;

      // Skip if addon hasn't started yet or has ended
      if (current < startOfMonth(addonStart)) continue;
      if (addonEnd && current > addonEnd) continue;

      // Calculate addon month index from addon start
      const addonMonthIndex =
        (billingYear - addonStart.getFullYear()) * 12 +
        (billingMonth - addonStart.getMonth());
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
        if (monthIndex === 0 && startDate.getDate() !== 1) {
          const startDay = startDate.getDate();
          addonFee = ((daysInMonth - startDay + 1) / daysInMonth) * charge;
        }
        await prisma.billItem.create({
          data: {
            bill_id: bill.id,
            description: "Add-on",
            amount: addonFee,
            type: "GENERATED",
          },
        });
      }
    }

    bills.push(bill);
    current = addMonths(current, 1);
    current = startOfMonth(current);
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
  const today = new Date();
  const endDate = lastDayOfMonth(today);
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

  const targetMonth = targetDate.getMonth();
  const targetYear = targetDate.getFullYear();
  const dueDate = lastDayOfMonth(targetDate);

  // Check if bill already exists for this month (IDEMPOTENT)
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

  // Full room fee (no proration for subsequent months)
  await prisma.billItem.create({
    data: {
      bill_id: bill.id,
      description: "Biaya Sewa",
      amount: fee,
      type: "GENERATED",
    },
  });

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
  }

  // Addon fees for this month (BL-017)
  const startDate = new Date(booking.start_date);
  for (const bookingAddon of booking.addOns || []) {
    const addonStart = new Date(bookingAddon.start_date);
    const addonEnd = bookingAddon.end_date
      ? new Date(bookingAddon.end_date)
      : null;
    if (targetDate < startOfMonth(addonStart)) continue;
    if (addonEnd && targetDate > addonEnd) continue;

    const addonMonthIndex =
      (targetYear - addonStart.getFullYear()) * 12 +
      (targetMonth - addonStart.getMonth());
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
    }
  }

  return bill;
}

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

      // 6. Payment reallocation (Phase 11 integration point)
      // Will be connected once Phase 11 is implemented
    } else {
      // --- CREATE MODE ---
      const booking = await prisma.booking.create({
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

      // Update room status to OCCUPIED (status_id 2)
      await prisma.room.update({
        where: { id: data.room_id },
        data: { status_id: 2 },
      });
    }

    revalidatePath("/bookings");
    return { success: true };
  } catch (e: unknown) {
    console.error("Booking upsert error:", e);
    return { success: false, error: "Gagal menyimpan pemesanan" };
  }
}

// --- SCHEDULE END OF STAY (BL-033) ---
export async function scheduleEndOfStayAction(
  bookingId: number,
  endDate: Date
) {
  try {
    // 1. Update booking: end_date=endDate, is_rolling=false
    await prisma.booking.update({
      where: { id: bookingId },
      data: { end_date: endDate, is_rolling: false },
    });

    // 2. Delete bills with due_date > endDate
    await prisma.bill.deleteMany({
      where: { booking_id: bookingId, due_date: { gt: endDate } },
    });

    revalidatePath("/bookings");
    return { success: true };
  } catch (e: unknown) {
    console.error("Schedule end error:", e);
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
        data: { end_date: data.event_date, is_rolling: false },
      });

      // Update deposit status if provided
      if (data.deposit_status) {
        const deposit = await prisma.deposit.findUnique({
          where: { booking_id: data.booking_id },
        });
        if (deposit) {
          const updateData: {
            status: DepositStatus;
            applied_at?: Date;
            refunded_at?: Date;
            refunded_amount?: number;
          } = { status: data.deposit_status };
          if (data.deposit_status === "APPLIED")
            updateData.applied_at = new Date();
          if (
            data.deposit_status === "REFUNDED" ||
            data.deposit_status === "PARTIALLY_REFUNDED"
          ) {
            updateData.refunded_at = new Date();
            updateData.refunded_amount = data.refunded_amount;
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
    }

    revalidatePath("/bookings");
    return { success: true };
  } catch (e: unknown) {
    console.error("Check in/out error:", e);
    return { success: false, error: "Gagal mencatat check-in/out" };
  }
}

// --- DELETE BOOKING ---
export async function deleteBookingAction(id: number) {
  try {
    const booking = await prisma.booking.findUnique({ where: { id } });
    const roomId = booking?.room_id;

    // Delete booking (cascades bills, payments, etc.)
    await prisma.booking.delete({ where: { id } });

    // Reset room status to AVAILABLE (status_id 1)
    if (roomId) {
      await prisma.room.update({
        where: { id: roomId },
        data: { status_id: 1 },
      });
    }

    revalidatePath("/bookings");
    return { success: true };
  } catch (e: unknown) {
    console.error("Delete booking error:", e);
    return { success: false, error: "Gagal menghapus pemesanan" };
  }
}
