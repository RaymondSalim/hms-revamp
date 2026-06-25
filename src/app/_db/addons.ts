import { prisma } from "@/app/_lib/prisma";
import {
  toSkipTake,
  buildPaginated,
  type TableParams,
  type Paginated,
} from "@/app/_lib/util/table-params";
import { Prisma } from "@prisma/client";

const addonListInclude = {
  pricing: true,
  children: true,
} satisfies Prisma.AddOnInclude;

export type AddonListRow = Prisma.AddOnGetPayload<{ include: typeof addonListInclude }>;

export const ADDON_SORT_KEYS = ["name", "description"] as const;

function addonOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.AddOnOrderByWithRelationInput[] {
  const map: Record<string, Prisma.AddOnOrderByWithRelationInput> = {
    name: { name: dir },
    description: { description: dir },
  };
  const primary = map[sortBy ?? "name"] ?? map.name;
  return [primary, { id: dir }];
}

export async function getAddonsPage(
  locationId: number,
  params: TableParams
): Promise<Paginated<AddonListRow>> {
  const search = params.search;
  const where: Prisma.AddOnWhereInput = {
    location_id: locationId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(params);
  const [rows, total] = await Promise.all([
    prisma.addOn.findMany({
      where,
      include: addonListInclude,
      orderBy: addonOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.addOn.count({ where }),
  ]);

  return buildPaginated(rows, total, params);
}

export async function getAddonsByLocation(locationId: number) {
  return prisma.addOn.findMany({
    where: { location_id: locationId },
    include: { pricing: true, children: true },
    orderBy: { name: "asc" },
  });
}

export async function getAddonById(id: string) {
  return prisma.addOn.findUnique({ where: { id }, include: { pricing: true, children: true, parentAddOn: true } });
}

export async function createAddon(data: { name: string; description?: string; location_id: number; parent_addon_id?: string; requires_input: boolean }) {
  return prisma.addOn.create({ data });
}

export async function deleteAddon(id: string) {
  return prisma.addOn.delete({ where: { id } });
}
