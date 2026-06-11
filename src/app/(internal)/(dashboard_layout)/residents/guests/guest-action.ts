"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import { lastDayOfMonth } from "date-fns";
import { guestSchema, guestStaySchema } from "@/app/_lib/zod/guest/zod";
import { getIndonesianMonthName } from "@/app/_lib/util/datetime";
import { splitGuestStayByMonth } from "@/app/_lib/util/guest-billing";
import { checkPermission } from "@/app/_lib/rbac";
import { assignInvoiceNumber } from "@/app/_lib/util/invoice-number";

export async function upsertGuestAction(data: { id?: number; name: string; email?: string; phone?: string; booking_id: number }) {
  const { authorized } = await checkPermission("guests.manage");
  if (!authorized) return { success: false as const, error: "Unauthorized" };

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
  const { authorized } = await checkPermission("guests.manage");
  if (!authorized) return { success: false as const, error: "Unauthorized" };

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
  const guest = await prisma.guest.findUnique({ where: { id: data.guest_id }, include: { booking: { include: { rooms: true } } } });
  if (!guest) return { success: false as const, error: "Guest not found" };

  const guestLocationId = guest.booking.rooms?.location_id ?? null;

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
      // Assign sequential invoice number (skipped when location is unknown)
      await assignInvoiceNumber(bill.id, guestLocationId, dueDate);
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
  const { authorized } = await checkPermission("guests.manage");
  if (!authorized) return { success: false as const, error: "Unauthorized" };

  await prisma.guest.delete({ where: { id: guestId } });
  revalidatePath("/residents/guests");
  return { success: true as const };
}

export async function deleteGuestStayAction(stayId: number) {
  const { authorized } = await checkPermission("guests.manage");
  if (!authorized) return { success: false as const, error: "Unauthorized" };
  // Delete associated bill items first
  await prisma.billItem.deleteMany({
    where: { related_id: { path: ["guest_stay_id"], equals: stayId } },
  });
  await prisma.guestStay.delete({ where: { id: stayId } });
  revalidatePath("/residents/guests");
  return { success: true as const };
}
