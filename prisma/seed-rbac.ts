import { PrismaClient } from "@prisma/client";

export const ROLES = [
  { id: 1, name: "Admin", description: "Full system access" },
  { id: 2, name: "Manager", description: "Property management access" },
  { id: 3, name: "Staff", description: "Day-to-day operations" },
  { id: 4, name: "Viewer", description: "Read-only access" },
];

export const PERMISSIONS = [
  { id: 1, permission: "dashboard.view" },
  { id: 2, permission: "bookings.view" },
  { id: 3, permission: "bookings.manage" },
  { id: 4, permission: "bills.view" },
  { id: 5, permission: "bills.manage" },
  { id: 6, permission: "payments.view" },
  { id: 7, permission: "payments.manage" },
  { id: 8, permission: "deposits.view" },
  { id: 9, permission: "deposits.manage" },
  { id: 10, permission: "tenants.view" },
  { id: 11, permission: "tenants.manage" },
  { id: 12, permission: "guests.view" },
  { id: 13, permission: "guests.manage" },
  { id: 14, permission: "rooms.view" },
  { id: 15, permission: "rooms.manage" },
  { id: 16, permission: "room_types.view" },
  { id: 17, permission: "room_types.manage" },
  { id: 18, permission: "durations.view" },
  { id: 19, permission: "durations.manage" },
  { id: 20, permission: "addons.view" },
  { id: 21, permission: "addons.manage" },
  { id: 22, permission: "financials.view" },
  { id: 23, permission: "financials.export" },
  { id: 24, permission: "calendar.view" },
  { id: 25, permission: "locations.view" },
  { id: 26, permission: "locations.manage" },
  { id: 27, permission: "users.view" },
  { id: 28, permission: "users.manage" },
  { id: 29, permission: "roles.manage" },
];

/**
 * Idempotently sync roles, permissions, and role→permission grants. Safe to run
 * against a populated database: it only touches the RBAC tables, leaving users,
 * settings, and business data alone. The rolePermission table is fully rebuilt
 * so newly-added permissions (e.g. locations.*) get granted to existing roles.
 */
export async function seedRbac(prisma: PrismaClient) {
  await prisma.role.createMany({ data: ROLES, skipDuplicates: true });
  await prisma.permission.createMany({ data: PERMISSIONS, skipDuplicates: true });

  const allPermissionIds = PERMISSIONS.map((p) => p.id);

  // Admin: all permissions
  const adminPerms = allPermissionIds.map((permission_id) => ({
    role_id: 1,
    permission_id,
  }));

  // Manager: everything except user/role management
  const managerPerms = PERMISSIONS.filter(
    (p) => !["users.manage", "roles.manage"].includes(p.permission)
  ).map((p) => ({ role_id: 2, permission_id: p.id }));

  // Staff: view all + manage bookings, bills, payments, deposits, tenants, guests
  const staffPerms = PERMISSIONS.filter((p) => {
    if (
      p.permission.endsWith(".view") ||
      p.permission === "financials.export" ||
      p.permission === "dashboard.view" ||
      p.permission === "calendar.view"
    )
      return true;
    if (
      [
        "bookings.manage",
        "bills.manage",
        "payments.manage",
        "deposits.manage",
        "tenants.manage",
        "guests.manage",
      ].includes(p.permission)
    )
      return true;
    return false;
  }).map((p) => ({ role_id: 3, permission_id: p.id }));

  // Viewer: only view permissions
  const viewerPerms = PERMISSIONS.filter(
    (p) =>
      p.permission.endsWith(".view") ||
      p.permission === "dashboard.view" ||
      p.permission === "calendar.view"
  ).map((p) => ({ role_id: 4, permission_id: p.id }));

  await prisma.rolePermission.deleteMany({});
  await prisma.rolePermission.createMany({
    data: [...adminPerms, ...managerPerms, ...staffPerms, ...viewerPerms],
    skipDuplicates: true,
  });
}
