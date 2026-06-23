import { prisma } from "@/app/_lib/prisma";

export async function createNote(data: {
  content: string;
  tenant_id?: string;
  booking_id?: number;
  created_by: string;
}) {
  return prisma.note.create({ data });
}

export async function deleteNote(id: number) {
  await prisma.note.delete({ where: { id } });
}

export async function getNotesByTenant(tenantId: string, bookingIds: number[]) {
  return prisma.note.findMany({
    where: {
      OR: [
        { tenant_id: tenantId },
        ...(bookingIds.length > 0 ? [{ booking_id: { in: bookingIds } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, name: true } } },
  });
}
