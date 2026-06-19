import { prisma } from "@/app/_lib/prisma";

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
