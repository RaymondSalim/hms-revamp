import { prisma } from "@/app/_lib/prisma";

export async function getUserByEmail(email: string) {
  return prisma.siteUser.findUnique({
    where: { email },
    include: { roles: true, userLocations: true },
  });
}

export async function getUserById(id: string) {
  return prisma.siteUser.findUnique({
    where: { id },
    include: { roles: true, userLocations: true },
  });
}

export async function getUserLocationIds(id: string): Promise<number[]> {
  const rows = await prisma.userLocation.findMany({
    where: { user_id: id },
    select: { location_id: true },
  });
  return rows.map((r) => r.location_id);
}

// Replace the full assignment set for a user. Empty array = global (no restriction).
export async function setUserLocations(userId: string, locationIds: number[]) {
  return prisma.$transaction([
    prisma.userLocation.deleteMany({ where: { user_id: userId } }),
    prisma.userLocation.createMany({
      data: locationIds.map((location_id) => ({ user_id: userId, location_id })),
      skipDuplicates: true,
    }),
  ]);
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
