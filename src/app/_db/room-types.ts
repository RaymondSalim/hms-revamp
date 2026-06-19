import { prisma } from "@/app/_lib/prisma";

export async function getRoomTypes() {
  return prisma.roomType.findMany({ orderBy: { type: "asc" } });
}

export async function getRoomTypeById(id: number) {
  return prisma.roomType.findUnique({ where: { id }, include: { roomtypedurations: true } });
}

export async function createRoomType(data: { type: string; description?: string }) {
  return prisma.roomType.create({ data });
}

export async function updateRoomType(id: number, data: { type?: string; description?: string }) {
  return prisma.roomType.update({ where: { id }, data });
}

export async function deleteRoomType(id: number) {
  return prisma.roomType.delete({ where: { id } });
}

export async function getRoomTypeDurations(locationId: number) {
  return prisma.roomTypeDuration.findMany({
    where: { location_id: locationId },
    include: { roomtypes: true, durations: true },
  });
}

export async function upsertRoomTypeDuration(data: { room_type_id: number; duration_id: number; location_id: number; suggested_price: number | null }) {
  return prisma.roomTypeDuration.upsert({
    where: { room_type_id_duration_id_location_id: { room_type_id: data.room_type_id, duration_id: data.duration_id, location_id: data.location_id } },
    update: { suggested_price: data.suggested_price },
    create: data,
  });
}
