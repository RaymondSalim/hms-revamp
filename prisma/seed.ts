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
