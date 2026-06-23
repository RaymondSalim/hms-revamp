import { prisma } from "@/app/_lib/prisma";

export async function getTenants() {
  return prisma.tenant.findMany({ orderBy: { name: "asc" } });
}

export async function getTenantById(id: string) {
  return prisma.tenant.findUnique({ where: { id }, include: { second_resident: true, bookings: true } });
}

export async function createTenant(data: {
  name: string; email?: string; phone?: string; id_number: string;
  current_address?: string; emergency_contact_name?: string; emergency_contact_phone?: string;
  referral_source?: string; id_file?: string; family_certificate_file?: string;
  second_resident_name?: string; second_resident_email?: string; second_resident_phone?: string;
  second_resident_id_number?: string; second_resident_id_file?: string; second_resident_relation?: string;
}) {
  return prisma.tenant.create({ data });
}

export async function updateTenant(id: string, data: Partial<Parameters<typeof createTenant>[0]>) {
  return prisma.tenant.update({ where: { id }, data });
}

export async function deleteTenant(id: string) {
  return prisma.tenant.delete({ where: { id } });
}

export async function getTenantProfile(id: string) {
  return prisma.tenant.findUnique({
    where: { id },
    include: {
      second_resident: true,
      second_resident_of: true,
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true } } },
      },
      bookings: {
        where: { deletedAt: null },
        orderBy: { start_date: "desc" },
        include: {
          rooms: { include: { locations: true, roomtypes: true } },
          durations: true,
          bookingstatuses: true,
          deposit: true,
          bills: {
            where: { deletedAt: null },
            orderBy: { due_date: "desc" },
            include: { bill_item: true, paymentBills: true },
          },
          payments: {
            where: { deletedAt: null },
            orderBy: { payment_date: "desc" },
            include: { paymentstatuses: true, paymentBills: true },
          },
        },
      },
    },
  });
}

export type TenantProfile = NonNullable<Awaited<ReturnType<typeof getTenantProfile>>>;
