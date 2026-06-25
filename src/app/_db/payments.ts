import { prisma } from "@/app/_lib/prisma";
import { Prisma, PaymentMethod } from "@prisma/client";
import type { LocationScope } from "@/app/_lib/util/location-scope";
import {
  toSkipTake,
  buildPaginated,
  type TableParams,
  type Paginated,
} from "@/app/_lib/util/table-params";
import { PAYMENT_STATUS } from "@/app/_lib/util/status";

const paymentWithRelations = {
  include: {
    bookings: { include: { tenants: true, rooms: true } },
    paymentBills: true,
    paymentstatuses: true,
  },
} satisfies Prisma.PaymentDefaultArgs;

export type PaymentWithRelations = Prisma.PaymentGetPayload<
  typeof paymentWithRelations
>;

export const PAYMENT_SORT_KEYS = [
  "payment_date",
  "amount",
  "booking",
  "status",
] as const;

export interface PaymentFilter {
  status?: "pending";
}

/** Map a free-text search term to a PaymentMethod enum value, if it names one. */
function matchPaymentMethod(search: string): PaymentMethod | null {
  if (!search) return null;
  const needle = search.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const match = Object.values(PaymentMethod).find((m) => m.includes(needle));
  return match ?? null;
}

function paymentOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.PaymentOrderByWithRelationInput[] {
  const map: Record<string, Prisma.PaymentOrderByWithRelationInput> = {
    payment_date: { payment_date: dir },
    amount: { amount: dir },
    booking: { bookings: { tenants: { name: dir } } },
    status: { paymentstatuses: { status: dir } },
  };
  const primary = map[sortBy ?? "payment_date"] ?? map.payment_date;
  return [primary, { id: dir }];
}

/**
 * Paginated, searchable, sortable payments for one location. Search matches
 * tenant name, room number, and payment method (case-insensitive).
 */
export async function getPaymentsPage(
  locationId: number,
  params: TableParams,
  opts: PaymentFilter = {}
): Promise<Paginated<PaymentWithRelations>> {
  const search = params.search;
  // payment_method is an enum, not free text, so match it only when the search
  // term names a known method (e.g. "cash", "bank_transfer", "ewallet").
  const methodMatch = matchPaymentMethod(search);
  const where: Prisma.PaymentWhereInput = {
    deletedAt: null,
    bookings: { rooms: { location_id: locationId } },
    ...(opts.status === "pending" ? { status_id: PAYMENT_STATUS.PENDING } : {}),
    ...(search
      ? {
          OR: [
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
            ...(methodMatch ? [{ payment_method: methodMatch }] : []),
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(params);
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      ...paymentWithRelations,
      orderBy: paymentOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.payment.count({ where }),
  ]);

  return buildPaginated(rows, total, params);
}

export async function getPaymentsByBooking(bookingId: number) {
  return prisma.payment.findMany({
    where: { booking_id: bookingId, deletedAt: null },
    include: { paymentBills: true, paymentstatuses: true },
    orderBy: { payment_date: "asc" },
  });
}

export async function getPaymentById(id: number, scope: LocationScope) {
  return prisma.payment.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(scope === null ? {} : { bookings: { rooms: { location_id: { in: scope } } } }),
    },
    include: { paymentBills: { include: { bill: { include: { bill_item: true } } } }, paymentstatuses: true, bookings: { include: { rooms: true, tenants: true } } },
  });
}

export async function createPayment(data: { booking_id: number; amount: number; payment_date: Date; payment_proof?: string; status_id?: number }) {
  return prisma.payment.create({ data });
}

export async function updatePayment(id: number, data: { amount?: number; payment_date?: Date; payment_proof?: string; status_id?: number }) {
  return prisma.payment.update({ where: { id }, data });
}

export async function deletePayment(id: number) {
  return prisma.payment.delete({ where: { id } });
}

export async function createPaymentBill(data: { payment_id: number; bill_id: number; amount: number }) {
  return prisma.paymentBill.create({ data });
}

export async function deletePaymentBillsByPayment(paymentId: number) {
  return prisma.paymentBill.deleteMany({ where: { payment_id: paymentId } });
}
