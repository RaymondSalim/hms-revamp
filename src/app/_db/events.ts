import { prisma } from "@/app/_lib/prisma";

export async function getEvents() {
  return prisma.event.findMany({ orderBy: { start: "asc" } });
}

export async function getEventById(id: number) {
  return prisma.event.findUnique({ where: { id } });
}

export async function createEvent(data: { title: string; description?: string; start: Date; end?: Date; allDay?: boolean; backgroundColor?: string; borderColor?: string; textColor?: string; recurring?: boolean; extendedProps?: any }) {
  return prisma.event.create({ data });
}

export async function updateEvent(id: number, data: Partial<Parameters<typeof createEvent>[0]>) {
  return prisma.event.update({ where: { id }, data });
}

export async function deleteEvent(id: number) {
  return prisma.event.delete({ where: { id } });
}
