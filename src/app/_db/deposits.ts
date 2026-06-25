import { prisma } from "@/app/_lib/prisma";
import { Prisma } from "@prisma/client";
import {
  toSkipTake,
  buildPaginated,
  type TableParams,
  type Paginated,
} from "@/app/_lib/util/table-params";

const depositListInclude = {
  booking: { include: { tenants: true, rooms: true } },
} satisfies Prisma.DepositInclude;

export type DepositListRow = Prisma.DepositGetPayload<{ include: typeof depositListInclude }>;

export const DEPOSIT_SORT_KEYS = ["created", "amount", "status", "tenant"] as const;

function depositOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.DepositOrderByWithRelationInput[] {
  const map: Record<string, Prisma.DepositOrderByWithRelationInput> = {
    created: { createdAt: dir },
    amount: { amount: dir },
    status: { status: dir },
    tenant: { booking: { tenants: { name: dir } } },
  };
  const primary = map[sortBy ?? "created"] ?? map.created;
  return [primary, { id: dir }];
}

export async function getDepositsPage(
  locationId: number,
  params: TableParams
): Promise<Paginated<DepositListRow>> {
  const search = params.search;
  const where: Prisma.DepositWhereInput = {
    booking: { rooms: { location_id: locationId } },
    ...(search
      ? {
          OR: [
            {
              booking: {
                tenants: { name: { contains: search, mode: "insensitive" } },
              },
            },
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
    prisma.deposit.findMany({
      where,
      include: depositListInclude,
      orderBy: depositOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.deposit.count({ where }),
  ]);

  return buildPaginated(rows, total, params);
}
