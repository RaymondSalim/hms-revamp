import { prisma } from "@/app/_lib/prisma";
import type { LocationScope } from "@/app/_lib/util/location-scope";
import { ROOM_STATUS } from "@/app/_lib/util/status";
import {
  toSkipTake,
  buildPaginated,
  type TableParams,
  type Paginated,
} from "@/app/_lib/util/table-params";
import { Prisma } from "@prisma/client";

export async function getRoomsByLocation(locationId: number) {
  return prisma.room.findMany({
    where: { location_id: locationId },
    include: { roomtypes: true, roomstatuses: true, locations: true },
    orderBy: { room_number: "asc" },
  });
}

export async function getRoomById(id: number, scope: LocationScope) {
  return prisma.room.findFirst({
    where: {
      id,
      ...(scope === null ? {} : { location_id: { in: scope } }),
    },
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
    where: { location_id: locationId, status_id: ROOM_STATUS.AVAILABLE },
    include: { roomtypes: true },
    orderBy: { room_number: "asc" },
  });
}

const roomListInclude = {
  roomtypes: true,
  roomstatuses: true,
  locations: true,
} satisfies Prisma.RoomInclude;

export type RoomListRow = Prisma.RoomGetPayload<{ include: typeof roomListInclude }>;

/** DB-backed columns the rooms table may sort by. */
export const ROOM_SORT_KEYS = ["room_number", "room_type", "status"] as const;

function roomOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.RoomOrderByWithRelationInput[] {
  const map: Record<string, Prisma.RoomOrderByWithRelationInput> = {
    room_number: { room_number: dir },
    room_type: { roomtypes: { type: dir } },
    status: { roomstatuses: { status: dir } },
  };
  const primary = map[sortBy ?? "room_number"] ?? map.room_number;
  return [primary, { id: dir }];
}

export async function getRoomsPage(
  locationId: number,
  params: TableParams
): Promise<Paginated<RoomListRow>> {
  const search = params.search;
  const where: Prisma.RoomWhereInput = {
    location_id: locationId,
    ...(search
      ? {
          OR: [
            { room_number: { contains: search, mode: "insensitive" } },
            { roomtypes: { type: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(params);
  const [rows, total] = await Promise.all([
    prisma.room.findMany({
      where,
      include: roomListInclude,
      orderBy: roomOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.room.count({ where }),
  ]);

  return buildPaginated(rows, total, params);
}
