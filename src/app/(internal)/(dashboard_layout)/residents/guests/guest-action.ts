"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import { lastDayOfMonth } from "date-fns";
import { guestSchema, guestStaySchema } from "@/app/_lib/zod/guest/zod";
import { getIndonesianMonthName } from "@/app/_lib/util/datetime";

export function splitGuestStayByMonth(startDate: Date, endDate: Date, dailyFee: number) {
  const segments: Array<{ month: number; year: number; days: number; amount: number }> = [];
  let current = new Date(startDate);

  while (current <= endDate) {
    const monthEnd = lastDayOfMonth(current);
    const segmentEnd = monthEnd < endDate ? monthEnd : endDate;

    // Days = (segmentEnd - current) / ms_per_day + 1
    const days = Math.round((segmentEnd.getTime() - current.getTime()) / 86400000) + 1;
    const amount = days * dailyFee;

    segments.push({ month: current.getMonth(), year: current.getFullYear(), days, amount });

    // Move to first day of next month
    current = new Date(segmentEnd);
    current.setDate(current.getDate() + 1);
  }

  return segments;
}

export async function upsertGuestAction(data: { id?: number; name: string; email?: string; phone?: string; booking_id: number }) {
  const parsed = guestSchema.safeParse(data);
  if (!parsed.success) return { success: false as const, error: parsed.error.flatten() };

  if (data.id) {
    await prisma.guest.update({ where: { id: data.id }, data: { name: data.name, email: data.email, phone: data.phone } });
  } else {
    await prisma.guest.create({ data: { name: data.name, email: data.email || undefined, phone: data.phone || undefined, booking_id: data.booking_id } });
  }

  revalidatePath("/residents/guests");
  return { success: true as const };
}

export async function upsertGuestStayAction(data: { id?: number; guest_id: number; start_date: Date; end_date: Date; daily_fee: number }) {
  const parsed = guestStaySchema.safeParse(data);
  if (!parsed.success) return { success: false as const, error: parsed.error.flatten() };

  const startDate = new Date(data.start_date);
  const endDate = new Date(data.end_date);

  // Create/update GuestStay record
  let guestStay;
  if (data.id) {
    guestStay = await prisma.guestStay.update({ where: { id: data.id }, data: { start_date: startDate, end_date: endDate, daily_fee: data.daily_fee } });
  } else {
    guestStay = await prisma.guestStay.create({ data: { guest_id: data.guest_id, start_date: startDate, end_date: endDate, daily_fee: data.daily_fee } });
  }

  // Get guest's booking
  const guest = await prisma.guest.findUnique({ where: { id: data.guest_id }, include: { booking: true } });
  if (!guest) return { success: false as const, error: "Guest not found" };

  // Delete old bill items for this guest stay (if editing)
  if (data.id) {
    await prisma.billItem.deleteMany({
      where: { related_id: { path: ["guest_stay_id"], equals: guestStay.id } },
    });
  }

  // Split into monthly segments and create bill items
  const segments = splitGuestStayByMonth(startDate, endDate, data.daily_fee);

  for (const segment of segments) {
    // Find the matching bill for this month
    const dueDate = lastDayOfMonth(new Date(segment.year, segment.month, 1));
    let bill = await prisma.bill.findFirst({
      where: { booking_id: guest.booking_id, due_date: dueDate },
    });

    // If no bill exists for this month, create one
    if (!bill) {
      const description = `Tagihan untuk Bulan ${getIndonesianMonthName(segment.month)} ${segment.year}`;
      bill = await prisma.bill.create({
        data: { booking_id: guest.booking_id, description, due_date: dueDate },
      });
    }

    // Create bill item
    await prisma.billItem.create({
      data: {
        bill_id: bill.id,
        description: `Tamu: ${guest.name} (${segment.days} hari)`,
        amount: segment.amount,
        type: "GENERATED",
        related_id: { guest_stay_id: guestStay.id },
      },
    });
  }

  revalidatePath("/residents/guests");
  return { success: true as const };
}

export async function deleteGuestAction(guestId: number) {
  await prisma.guest.delete({ where: { id: guestId } });
  revalidatePath("/residents/guests");
  return { success: true as const };
}

export async function deleteGuestStayAction(stayId: number) {
  // Delete associated bill items first
  await prisma.billItem.deleteMany({
    where: { related_id: { path: ["guest_stay_id"], equals: stayId } },
  });
  await prisma.guestStay.delete({ where: { id: stayId } });
  revalidatePath("/residents/guests");
  return { success: true as const };
}
