import { prisma } from "@/app/_lib/prisma";

export async function getUserByEmail(email: string) {
  return prisma.siteUser.findUnique({ where: { email }, include: { roles: true } });
}

export async function getUserById(id: string) {
  return prisma.siteUser.findUnique({ where: { id }, include: { roles: true } });
}

export async function getAllUsers() {
  return prisma.siteUser.findMany({ include: { roles: true }, orderBy: { name: "asc" } });
}

export async function createUser(data: { name: string; email: string; password: string; role_id: number }) {
  return prisma.siteUser.create({ data });
}

export async function updateUser(id: string, data: { name?: string; email?: string; password?: string; role_id?: number; shouldReset?: boolean }) {
  return prisma.siteUser.update({ where: { id }, data });
}

export async function deleteUser(id: string) {
  return prisma.siteUser.delete({ where: { id } });
}
