import { prisma } from "@/app/_lib/prisma";
import type { LocationScope } from "@/app/_lib/util/location-scope";

export async function getLocations() {
  return prisma.location.findMany({ orderBy: { name: "asc" } });
}

// Locations visible to a user given their scope. Global (null) sees all.
export async function getLocationsForUser(scope: LocationScope) {
  return prisma.location.findMany({
    where: scope === null ? undefined : { id: { in: scope } },
    orderBy: { name: "asc" },
  });
}

export async function getLocationById(id: number) {
  return prisma.location.findUnique({ where: { id } });
}

export async function createLocation(data: { name: string; address: string }) {
  return prisma.location.create({ data });
}

export async function updateLocation(id: number, data: { name: string; address: string }) {
  return prisma.location.update({ where: { id }, data });
}

export async function deleteLocation(id: number) {
  return prisma.location.delete({ where: { id } });
}
