import { prisma } from "@/app/_lib/prisma";
import { BillType, Prisma } from "@prisma/client";
import type { LocationScope } from "@/app/_lib/util/location-scope";
import {
  toSkipTake,
  buildPaginated,
  type TableParams,
  type Paginated,
} from "@/app/_lib/util/table-params";

export async function getBillsByBooking(bookingId: number) {
  return prisma.bill.findMany({
    where: { booking_id: bookingId, deletedAt: null },
    include: { bill_item: true, paymentBills: true },
    orderBy: { due_date: "asc" },
  });
}

const billWithRelations = {
  include: {
    bill_item: true,
    paymentBills: true,
    bookings: { include: { tenants: true, rooms: true } },
  },
} satisfies Prisma.BillDefaultArgs;

export type BillWithRelations = Prisma.BillGetPayload<typeof billWithRelations>;

/** Columns that can be sorted at the DB level. Aggregate totals (total/paid/
 *  outstanding) are NOT sortable here — see Tier 2 backlog. */
export const BILL_SORT_KEYS = [
  "due_date",
  "description",
  "invoice_number",
  "room_tenant",
] as const;

function billOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.BillOrderByWithRelationInput[] {
  const map: Record<string, Prisma.BillOrderByWithRelationInput> = {
    due_date: { due_date: dir },
    description: { description: dir },
    invoice_number: { invoice_number: dir },
    room_tenant: { bookings: { tenants: { name: dir } } },
  };
  const primary = map[sortBy ?? "due_date"] ?? map.due_date;
  return [primary, { id: dir }];
}

/**
 * Paginated, searchable, sortable bills for one location. Search matches
 * invoice number, description, tenant name, and room number (case-insensitive).
 */
export async function getBillsPage(
  locationId: number,
  params: TableParams
): Promise<Paginated<BillWithRelations>> {
  const search = params.search;
  const where: Prisma.BillWhereInput = {
    deletedAt: null,
    bookings: { rooms: { location_id: locationId } },
    ...(search
      ? {
          OR: [
            { invoice_number: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            {
              bookings: {
                tenants: { name: { contains: search, mode: "insensitive" } },
              },
            },
            {
              bookings: {
                rooms: {
                  room_number: { contains: search, mode: "insensitive" },
                },
              },
            },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(params);
  const [rows, total] = await Promise.all([
    prisma.bill.findMany({
      where,
      ...billWithRelations,
      orderBy: billOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.bill.count({ where }),
  ]);

  return buildPaginated(rows, total, params);
}

export async function getBillById(id: number, scope: LocationScope) {
  return prisma.bill.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(scope === null ? {} : { bookings: { rooms: { location_id: { in: scope } } } }),
    },
    include: { bill_item: true, paymentBills: true, bookings: { include: { tenants: true, rooms: true } } },
  });
}

export async function createBill(data: { booking_id: number; description: string; due_date: Date }) {
  return prisma.bill.create({ data });
}

export async function createBillItem(data: {
  bill_id: number; description: string; amount: number;
  internal_description?: string; type?: BillType; related_id?: any;
}) {
  return prisma.billItem.create({ data: { ...data, amount: data.amount } });
}

export async function updateBillDueDate(id: number, dueDate: Date) {
  return prisma.bill.update({ where: { id }, data: { due_date: dueDate } });
}

export async function deleteBillsByBooking(bookingId: number) {
  return prisma.bill.deleteMany({ where: { booking_id: bookingId } });
}
