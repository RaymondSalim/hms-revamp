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
