import { prisma } from "@/app/_lib/prisma";

export async function getRoomsByLocation(locationId: number) {
  return prisma.room.findMany({
    where: { location_id: locationId },
    include: { roomtypes: true, roomstatuses: true, locations: true },
    orderBy: { room_number: "asc" },
  });
}

export async function getRoomById(id: number) {
  return prisma.room.findUnique({
    where: { id },
    include: { roomtypes: true, roomstatuses: true, locations: true, bookings: true },
  });
}

export async function createRoom(data: { room_number: string; room_type_id: number; status_id: number; location_id: number }) {
  return prisma.room.create({ data });
}

export async function updateRoom(id: number, data: { room_number?: string; room_type_id?: number; status_id?: number; location_id?: number }) {
  return prisma.room.update({ where: { id }, data });
}

export async function deleteRoom(id: number) {
  return prisma.room.delete({ where: { id } });
}

export async function getAvailableRoomsByLocation(locationId: number) {
  return prisma.room.findMany({
    where: { location_id: locationId, status_id: 1 },
    include: { roomtypes: true },
    orderBy: { room_number: "asc" },
  });
}
