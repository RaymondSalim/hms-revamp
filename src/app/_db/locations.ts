import { prisma } from "@/app/_lib/prisma";

export async function getLocations() {
  return prisma.location.findMany({ orderBy: { name: "asc" } });
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
