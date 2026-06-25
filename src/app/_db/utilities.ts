import { prisma } from "@/app/_lib/prisma";
import { Prisma } from "@prisma/client";
import {
  toSkipTake,
  buildPaginated,
  type TableParams,
  type Paginated,
} from "@/app/_lib/util/table-params";

const meterReadingListInclude = {
  booking: { include: { tenants: true, rooms: true } },
} satisfies Prisma.MeterReadingInclude;

export type MeterReadingListRow = Prisma.MeterReadingGetPayload<{
  include: typeof meterReadingListInclude;
}>;

export const UTILITY_SORT_KEYS = [
  "reading_date",
  "utility_type",
  "reading_value",
  "tenant",
] as const;

function utilityOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.MeterReadingOrderByWithRelationInput[] {
  const map: Record<string, Prisma.MeterReadingOrderByWithRelationInput> = {
    reading_date: { reading_date: dir },
    utility_type: { utility_type: dir },
    reading_value: { reading_value: dir },
    tenant: { booking: { tenants: { name: dir } } },
  };
  const primary = map[sortBy ?? "reading_date"] ?? map.reading_date;
  return [primary, { id: dir }];
}

export async function getUtilitiesPage(
  locationId: number,
  params: TableParams
): Promise<Paginated<MeterReadingListRow>> {
  const search = params.search;
  const where: Prisma.MeterReadingWhereInput = {
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
    prisma.meterReading.findMany({
      where,
      include: meterReadingListInclude,
      orderBy: utilityOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.meterReading.count({ where }),
  ]);

  return buildPaginated(rows, total, params);
}
