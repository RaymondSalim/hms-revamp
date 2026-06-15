import { redirect } from "next/navigation";
import { auth } from "@/app/_lib/auth";
import { prisma } from "@/app/_lib/prisma";
import { cache } from "react";

export type Permission =
  | "dashboard.view"
  | "bookings.view"
  | "bookings.manage"
  | "bills.view"
  | "bills.manage"
  | "payments.view"
  | "payments.manage"
  | "deposits.view"
  | "deposits.manage"
  | "tenants.view"
  | "tenants.manage"
  | "guests.view"
  | "guests.manage"
  | "rooms.view"
  | "rooms.manage"
  | "room_types.view"
  | "room_types.manage"
  | "durations.view"
  | "durations.manage"
  | "addons.view"
  | "addons.manage"
  | "financials.view"
  | "financials.export"
  | "calendar.view"
  | "locations.view"
  | "locations.manage"
  | "users.view"
  | "users.manage"
  | "roles.manage";

export const getUserPermissions = cache(async (): Promise<Set<Permission>> => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (!session.user.role_id) return new Set();

  const rolePermissions = await prisma.rolePermission.findMany({
    where: { role_id: session.user.role_id },
    include: { permissions: true },
  });

  return new Set(
    rolePermissions.map((rp) => rp.permissions.permission as Permission)
  );
});

export async function checkPermission(
  ...required: Permission[]
): Promise<{ authorized: boolean; permissions: Set<Permission> }> {
  const permissions = await getUserPermissions();
  const authorized = required.every((p) => permissions.has(p));
  return { authorized, permissions };
}

export async function requirePermission(
  ...required: Permission[]
): Promise<void> {
  const { authorized } = await checkPermission(...required);
  if (!authorized) {
    throw new Error("Unauthorized");
  }
}
