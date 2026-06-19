import { prisma } from "@/app/_lib/prisma";

export async function getDurations() {
  return prisma.duration.findMany({ orderBy: { month_count: "asc" } });
}

export async function getDurationById(id: number) {
  return prisma.duration.findUnique({ where: { id } });
}

export async function createDuration(data: { duration: string; month_count: number }) {
  return prisma.duration.create({ data });
}

export async function updateDuration(id: number, data: { duration: string; month_count: number }) {
  return prisma.duration.update({ where: { id }, data });
}

export async function deleteDuration(id: number) {
  return prisma.duration.delete({ where: { id } });
}
