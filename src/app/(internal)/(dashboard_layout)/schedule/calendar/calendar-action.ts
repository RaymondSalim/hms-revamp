"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import { eventSchema } from "@/app/_lib/zod/event/zod";
import { checkPermission } from "@/app/_lib/rbac";
import { getScopedLocationIds, isLocationInScope } from "@/app/_lib/util/location-scope";

export async function getCalendarEventsAction(locationId: number) {
  const { authorized } = await checkPermission("calendar.view");
  if (!authorized) return [];

  // Location scope guard: scoped users may only read events for their locations.
  const scope = await getScopedLocationIds();
  if (!isLocationInScope(scope, locationId)) return [];

  // Fetch custom events
  const events = await prisma.event.findMany();

  // Generate booking events
  const bookings = await prisma.booking.findMany({
    where: { rooms: { location_id: locationId }, deletedAt: null },
    include: { tenants: true, rooms: true },
  });

  const bookingEvents = bookings.flatMap((b) => {
    const evts: {
      id: string;
      title: string;
      start: string;
      allDay: boolean;
      backgroundColor: string;
      borderColor: string;
      extendedProps: { type: string; bookingId: number };
    }[] = [];
    evts.push({
      id: `booking-start-${b.id}`,
      title: `Check-in: ${b.tenants?.name || "Unknown"} (${b.rooms?.room_number || ""})`,
      start: b.start_date.toISOString(),
      allDay: true,
      backgroundColor: "#059669",
      borderColor: "#059669",
      extendedProps: { type: "booking-start", bookingId: b.id },
    });
    if (b.end_date) {
      evts.push({
        id: `booking-end-${b.id}`,
        title: `Check-out: ${b.tenants?.name || "Unknown"} (${b.rooms?.room_number || ""})`,
        start: b.end_date.toISOString(),
        allDay: true,
        backgroundColor: "#DC2626",
        borderColor: "#DC2626",
        extendedProps: { type: "booking-end", bookingId: b.id },
      });
    }
    return evts;
  });

  const customEvents = events.map((e) => ({
    id: `event-${e.id}`,
    title: e.title,
    start: e.start.toISOString(),
    end: e.end?.toISOString(),
    allDay: e.allDay,
    backgroundColor: e.backgroundColor || "#C2410C",
    borderColor: e.borderColor || "#C2410C",
    textColor: e.textColor || "#FFFFFF",
    extendedProps: {
      type: "custom",
      eventId: e.id,
      description: e.description,
      recurring: e.recurring,
    },
  }));

  return [...customEvents, ...bookingEvents];
}

export async function upsertEventAction(data: {
  id?: number;
  title: string;
  description?: string;
  start: Date;
  end?: Date;
  allDay: boolean;
  backgroundColor?: string;
  recurring: boolean;
}) {
  const { authorized } = await checkPermission("calendar.view");
  if (!authorized) return { success: false as const, error: "Unauthorized" };

  const parsed = eventSchema.safeParse(data);
  if (!parsed.success) return { success: false as const, error: parsed.error.flatten() };

  if (data.id) {
    await prisma.event.update({
      where: { id: data.id },
      data: {
        title: data.title,
        description: data.description,
        start: new Date(data.start),
        end: data.end ? new Date(data.end) : null,
        allDay: data.allDay,
        backgroundColor: data.backgroundColor,
        recurring: data.recurring,
      },
    });
  } else {
    await prisma.event.create({
      data: {
        title: data.title,
        description: data.description,
        start: new Date(data.start),
        end: data.end ? new Date(data.end) : null,
        allDay: data.allDay,
        backgroundColor: data.backgroundColor,
        recurring: data.recurring,
      },
    });
  }

  revalidatePath("/schedule/calendar");
  return { success: true as const };
}

export async function deleteEventAction(id: number) {
  const { authorized } = await checkPermission("calendar.view");
  if (!authorized) return { success: false, error: "Unauthorized" };

  await prisma.event.delete({ where: { id } });
  revalidatePath("/schedule/calendar");
  return { success: true };
}
