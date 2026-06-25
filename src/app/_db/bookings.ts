import { prisma } from "@/app/_lib/prisma";
import { Prisma } from "@prisma/client";
import type { LocationScope } from "@/app/_lib/util/location-scope";
import { BOOKING_STATUS } from "@/app/_lib/util/status";
import { businessToday } from "@/app/_lib/util/business-time";
import {
  toSkipTake,
  buildPaginated,
  type TableParams,
  type Paginated,
} from "@/app/_lib/util/table-params";

const bookingListInclude = {
  rooms: { include: { roomtypes: true, locations: true } },
  tenants: true,
  durations: true,
  bookingstatuses: true,
  deposit: true,
  bills: {
    where: { deletedAt: null },
    include: { bill_item: true, paymentBills: true },
  },
  payments: {
    where: { deletedAt: null },
    include: { paymentBills: true, paymentstatuses: true },
  },
  addOns: { include: { addOn: { include: { pricing: true } } } },
  guests: { include: { GuestStay: true } },
} satisfies Prisma.BookingInclude;

export async function getBookingsByLocation(locationId: number) {
  return prisma.booking.findMany({
    where: { rooms: { location_id: locationId }, deletedAt: null },
    include: bookingListInclude,
    orderBy: { createdAt: "desc" },
  });
}

export type BookingListRow = Prisma.BookingGetPayload<{
  include: typeof bookingListInclude;
}>;

/** DB-backed columns the bookings table may sort by (scalar + to-one relations). */
export const BOOKING_SORT_KEYS = [
  "start_date",
  "end_date",
  "fee",
  "createdAt",
  "room",
  "tenant",
  "status",
] as const;

function bookingOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.BookingOrderByWithRelationInput[] {
  const map: Record<string, Prisma.BookingOrderByWithRelationInput> = {
    start_date: { start_date: dir },
    end_date: { end_date: dir },
    fee: { fee: dir },
    createdAt: { createdAt: dir },
    room: { rooms: { room_number: dir } },
    tenant: { tenants: { name: dir } },
    status: { bookingstatuses: { status: dir } },
  };
  const primary = map[sortBy ?? "createdAt"] ?? map.createdAt;
  return [primary, { id: dir }];
}

export interface BookingFilter {
  checkin?: "today";
  expiring?: boolean;
}

/**
 * Paginated, searchable, sortable bookings for one location. Search matches
 * tenant name and room number (case-insensitive).
 */
export async function getBookingsPage(
  locationId: number,
  params: TableParams,
  opts: BookingFilter = {}
): Promise<Paginated<BookingListRow>> {
  const search = params.search;

  let filter: Prisma.BookingWhereInput = {};
  if (opts.checkin === "today") {
    const today = businessToday();
    filter = {
      start_date: today,
      status_id: { in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.ACTIVE] },
      checkInOutLogs: { none: { event_type: "CHECK_IN" } },
    };
  } else if (opts.expiring) {
    const today = businessToday();
    const in30 = new Date(today.getTime() + 30 * 86_400_000);
    filter = {
      status_id: BOOKING_STATUS.ACTIVE,
      is_rolling: false,
      end_date: { gte: today, lte: in30 },
    };
  }

  const where: Prisma.BookingWhereInput = {
    rooms: { location_id: locationId },
    deletedAt: null,
    ...filter,
    ...(search
      ? {
          OR: [
            { tenants: { name: { contains: search, mode: "insensitive" } } },
            {
              rooms: {
                room_number: { contains: search, mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(params);
  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: bookingListInclude,
      orderBy: bookingOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.booking.count({ where }),
  ]);

  return buildPaginated(rows, total, params);
}

export async function getBookingById(id: number, scope: LocationScope) {
  return prisma.booking.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(scope === null ? {} : { rooms: { location_id: { in: scope } } }),
    },
    include: {
      rooms: { include: { roomtypes: true, locations: true } },
      tenants: true, durations: true, bookingstatuses: true, deposit: true,
      bills: { where: { deletedAt: null }, include: { bill_item: true, paymentBills: true }, orderBy: { due_date: "asc" } },
      payments: { where: { deletedAt: null }, include: { paymentBills: true, paymentstatuses: true }, orderBy: { payment_date: "asc" } },
      addOns: { include: { addOn: { include: { pricing: true } } } },
      guests: { include: { GuestStay: true } },
      checkInOutLogs: true,
      penalties: true,
    },
  });
}

export async function getActiveRollingBookings() {
  return prisma.booking.findMany({
    where: { is_rolling: true, end_date: null, status_id: BOOKING_STATUS.ACTIVE, deletedAt: null },
    include: {
      rooms: { include: { roomtypes: true, locations: true } },
      tenants: true, deposit: true,
      addOns: { include: { addOn: { include: { pricing: true } } } },
      bills: { where: { deletedAt: null }, include: { bill_item: true } },
    },
  });
}
