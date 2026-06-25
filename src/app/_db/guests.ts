import { prisma } from "@/app/_lib/prisma";
import { Prisma } from "@prisma/client";
import {
  toSkipTake,
  buildPaginated,
  type TableParams,
  type Paginated,
} from "@/app/_lib/util/table-params";

export async function getGuestsByBooking(bookingId: number) {
  return prisma.guest.findMany({ where: { booking_id: bookingId }, include: { GuestStay: true } });
}

export async function getGuestById(id: number) {
  return prisma.guest.findUnique({ where: { id }, include: { GuestStay: true, booking: true } });
}

export async function createGuest(data: { name: string; email?: string; phone?: string; booking_id: number }) {
  return prisma.guest.create({ data });
}

export async function updateGuest(id: number, data: { name?: string; email?: string; phone?: string }) {
  return prisma.guest.update({ where: { id }, data });
}

export async function deleteGuest(id: number) {
  return prisma.guest.delete({ where: { id } });
}

export async function createGuestStay(data: { guest_id: number; start_date: Date; end_date: Date; daily_fee: number }) {
  return prisma.guestStay.create({ data });
}

export async function deleteGuestStay(id: number) {
  return prisma.guestStay.delete({ where: { id } });
}

const guestListInclude = {
  GuestStay: true,
  booking: { include: { rooms: true, tenants: true } },
} satisfies Prisma.GuestInclude;

export type GuestListRow = Prisma.GuestGetPayload<{ include: typeof guestListInclude }>;

export const GUEST_SORT_KEYS = ["name", "email", "phone", "room"] as const;

function guestOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.GuestOrderByWithRelationInput[] {
  const map: Record<string, Prisma.GuestOrderByWithRelationInput> = {
    name: { name: dir },
    email: { email: dir },
    phone: { phone: dir },
    room: { booking: { rooms: { room_number: dir } } },
  };
  const primary = map[sortBy ?? "name"] ?? map.name;
  return [primary, { id: dir }];
}

export async function getGuestsPage(
  locationId: number,
  params: TableParams
): Promise<Paginated<GuestListRow>> {
  const search = params.search;
  const where: Prisma.GuestWhereInput = {
    booking: { rooms: { location_id: locationId } },
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            {
              booking: {
                rooms: { room_number: { contains: search, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(params);
  const [rows, total] = await Promise.all([
    prisma.guest.findMany({
      where,
      include: guestListInclude,
      orderBy: guestOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.guest.count({ where }),
  ]);

  return buildPaginated(rows, total, params);
}
