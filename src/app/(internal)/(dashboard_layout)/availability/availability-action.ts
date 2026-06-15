"use server";

import { prisma } from "@/app/_lib/prisma";
import { checkPermission } from "@/app/_lib/rbac";
import { BOOKING_STATUS } from "@/app/_lib/util/status";

export interface RoomTypeAvailability {
  roomTypeId: number;
  roomType: string;
  total: number;
  booked: number;
  available: number;
}

export async function getAvailabilityAction(
  locationId: number,
  startDate: string,
  endDate: string
): Promise<{ success: true; data: RoomTypeAvailability[] } | { success: false; error: string }> {
  const { authorized } = await checkPermission("rooms.view");
  if (!authorized) return { success: false, error: "Unauthorized" };

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return { success: false, error: "Tanggal tidak valid" };
  }

  const rooms = await prisma.room.findMany({
    where: { location_id: locationId },
    select: {
      id: true,
      room_type_id: true,
      roomtypes: { select: { id: true, type: true } },
    },
  });

  const roomIds = rooms.map((r) => r.id);

  const overlappingBookings = await prisma.booking.findMany({
    where: {
      room_id: { in: roomIds },
      deletedAt: null,
      status_id: { in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.ACTIVE] },
      start_date: { lte: end },
      OR: [
        { end_date: { gte: start } },
        { end_date: null },
      ],
    },
    select: { room_id: true },
  });

  const bookedRoomIds = new Set(overlappingBookings.map((b) => b.room_id));

  const grouped = new Map<number, { type: string; total: number; booked: number }>();

  for (const room of rooms) {
    const typeId = room.room_type_id ?? 0;
    const typeName = room.roomtypes?.type ?? "Tanpa Tipe";
    if (!grouped.has(typeId)) {
      grouped.set(typeId, { type: typeName, total: 0, booked: 0 });
    }
    const entry = grouped.get(typeId)!;
    entry.total++;
    if (bookedRoomIds.has(room.id)) {
      entry.booked++;
    }
  }

  const data: RoomTypeAvailability[] = Array.from(grouped.entries()).map(
    ([roomTypeId, { type, total, booked }]) => ({
      roomTypeId,
      roomType: type,
      total,
      booked,
      available: total - booked,
    })
  );

  data.sort((a, b) => a.roomType.localeCompare(b.roomType));

  return { success: true, data };
}
