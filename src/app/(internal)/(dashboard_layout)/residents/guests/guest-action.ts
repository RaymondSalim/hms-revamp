"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import { lastDayOfUtcMonth } from "@/app/_lib/util/business-time";
import { guestSchema, guestStaySchema } from "@/app/_lib/zod/guest/zod";
import { getIndonesianMonthName } from "@/app/_lib/util/datetime";
import { splitGuestStayByMonth } from "@/app/_lib/util/guest-billing";
import { checkPermission } from "@/app/_lib/rbac";
import { getScopedLocationIds } from "@/app/_lib/util/location-scope";
import { assignInvoiceNumber } from "@/app/_lib/util/invoice-number";

// Confirm a booking's location is within the caller's scope.
async function bookingInScope(bookingId: number): Promise<boolean> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { rooms: { select: { location_id: true } } },
  });
  const locationId = booking?.rooms?.location_id;
  const scope = await getScopedLocationIds();
  return scope === null || (locationId != null && scope.includes(locationId));
}

// Resolve the booking behind a guest, then check scope.
async function guestInScope(guestId: number): Promise<boolean> {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: { booking_id: true },
  });
  if (!guest) return false;
  return bookingInScope(guest.booking_id);
}

export async function upsertGuestAction(data: { id?: number; name: string; email?: string; phone?: string; booking_id: number }) {
  const { authorized } = await checkPermission("guests.manage");
  if (!authorized) return { success: false as const, error: "Unauthorized" };

  if (!(await bookingInScope(data.booking_id))) {
    return { success: false as const, error: "Unauthorized" };
  }

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

  if (!(await guestInScope(data.guest_id))) {
    return { success: false as const, error: "Unauthorized" };
  }

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
    // Find the matching bill for this month. Intentionally NOT filtered by
    // deletedAt: we create the bill when none is found, and the
    // @@unique([booking_id, due_date]) constraint ignores soft-delete — so a
    // soft-deleted bill for this period must still be seen here to avoid a
    // unique-constraint violation on insert.
    const dueDate = lastDayOfUtcMonth(new Date(Date.UTC(segment.year, segment.month, 1)));
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

  if (!(await guestInScope(guestId))) {
    return { success: false as const, error: "Unauthorized" };
  }

  await prisma.guest.delete({ where: { id: guestId } });
  revalidatePath("/residents/guests");
  return { success: true as const };
}

export async function deleteGuestStayAction(stayId: number) {
  const { authorized } = await checkPermission("guests.manage");
  if (!authorized) return { success: false as const, error: "Unauthorized" };

  const stay = await prisma.guestStay.findUnique({
    where: { id: stayId },
    select: { guest_id: true },
  });
  if (!stay || !(await guestInScope(stay.guest_id))) {
    return { success: false as const, error: "Unauthorized" };
  }

  // Delete associated bill items first
  await prisma.billItem.deleteMany({
    where: { related_id: { path: ["guest_stay_id"], equals: stayId } },
  });
  await prisma.guestStay.delete({ where: { id: stayId } });
  revalidatePath("/residents/guests");
  return { success: true as const };
}
