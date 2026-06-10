import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // Booking Statuses
  await prisma.bookingStatus.createMany({
    data: [
      { id: 1, status: "PENDING" },
      { id: 2, status: "ACTIVE" },
      { id: 3, status: "COMPLETED" },
      { id: 4, status: "CANCELLED" },
    ],
    skipDuplicates: true,
  });

  // Payment Statuses
  await prisma.paymentStatus.createMany({
    data: [
      { id: 1, status: "PENDING" },
      { id: 2, status: "VERIFIED" },
      { id: 3, status: "REJECTED" },
    ],
    skipDuplicates: true,
  });

  // Room Statuses
  await prisma.roomStatus.createMany({
    data: [
      { id: 1, status: "AVAILABLE" },
      { id: 2, status: "OCCUPIED" },
      { id: 3, status: "MAINTENANCE" },
    ],
    skipDuplicates: true,
  });

  // Roles
  await prisma.role.createMany({
    data: [
      { id: 1, name: "Admin", description: "Full system access" },
      { id: 2, name: "Manager", description: "Property management access" },
      { id: 3, name: "Staff", description: "Day-to-day operations" },
      { id: 4, name: "Viewer", description: "Read-only access" },
    ],
    skipDuplicates: true,
  });

  // Default admin user
  const hashedPassword = await bcrypt.hash("admin123", 10);
  await prisma.siteUser.upsert({
    where: { email: "admin@micasasuites.com" },
    update: {},
    create: {
      name: "Administrator",
      email: "admin@micasasuites.com",
      password: hashedPassword,
      role_id: 1,
    },
  });

  // Permissions
  const permissions = [
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

  await prisma.permission.createMany({
    data: permissions,
    skipDuplicates: true,
  });

  // Role-Permission assignments
  const allPermissionIds = permissions.map((p) => p.id);

  // Admin: all permissions
  const adminPerms = allPermissionIds.map((permission_id) => ({
    role_id: 1,
    permission_id,
  }));

  // Manager: everything except user/role management
  const managerPerms = permissions
    .filter((p) => !["users.manage", "roles.manage"].includes(p.permission))
    .map((p) => ({ role_id: 2, permission_id: p.id }));

  // Staff: view all + manage bookings, bills, payments, deposits, tenants, guests
  const staffPerms = permissions
    .filter((p) => {
      if (p.permission.endsWith(".view") || p.permission === "financials.export" || p.permission === "dashboard.view" || p.permission === "calendar.view") return true;
      if (["bookings.manage", "bills.manage", "payments.manage", "deposits.manage", "tenants.manage", "guests.manage"].includes(p.permission)) return true;
      return false;
    })
    .map((p) => ({ role_id: 3, permission_id: p.id }));

  // Viewer: only view permissions
  const viewerPerms = permissions
    .filter((p) => p.permission.endsWith(".view") || p.permission === "dashboard.view" || p.permission === "calendar.view")
    .map((p) => ({ role_id: 4, permission_id: p.id }));

  // Clear existing role permissions and re-seed
  await prisma.rolePermission.deleteMany({});
  await prisma.rolePermission.createMany({
    data: [...adminPerms, ...managerPerms, ...staffPerms, ...viewerPerms],
    skipDuplicates: true,
  });

  // Settings
  await prisma.setting.createMany({
    data: [
      { setting_key: "APP_SETUP", setting_value: "false" },
      { setting_key: "COMPANY_NAME", setting_value: "Perusahaan Anda" },
      { setting_key: "COMPANY_IMAGE", setting_value: "" },
      { setting_key: "REGISTRATION_ENABLED", setting_value: "false" },
      { setting_key: "MONTHLY_INVOICE_EMAIL_REMINDER_ENABLED", setting_value: "false" },
    ],
    skipDuplicates: true,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
