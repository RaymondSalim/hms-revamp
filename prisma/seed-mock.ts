import {
  PrismaClient,
  TransactionType,
  BillType,
  DepositStatus,
  PaymentMethod,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { seedRbac } from "./seed-rbac";

const prisma = new PrismaClient();

async function main() {
  // ═══════════════════════════════════════════════════════
  // Reference Data
  // ═══════════════════════════════════════════════════════

  await prisma.bookingStatus.createMany({
    data: [
      { id: 1, status: "PENDING" },
      { id: 2, status: "ACTIVE" },
      { id: 3, status: "COMPLETED" },
      { id: 4, status: "CANCELLED" },
    ],
    skipDuplicates: true,
  });

  await prisma.paymentStatus.createMany({
    data: [
      { id: 1, status: "PENDING" },
      { id: 2, status: "VERIFIED" },
      { id: 3, status: "REJECTED" },
    ],
    skipDuplicates: true,
  });

  await prisma.roomStatus.createMany({
    data: [
      { id: 1, status: "Available" },
      { id: 2, status: "Occupied" },
      { id: 3, status: "Maintenance" },
    ],
    skipDuplicates: true,
  });

  // ═══════════════════════════════════════════════════════
  // RBAC (Roles + Permissions + Grants)
  // ═══════════════════════════════════════════════════════

  await seedRbac(prisma);

  // ═══════════════════════════════════════════════════════
  // Settings
  // ═══════════════════════════════════════════════════════

  await prisma.setting.createMany({
    data: [
      { setting_key: "APP_SETUP", setting_value: "true" },
      { setting_key: "COMPANY_NAME", setting_value: "Mi Casa Suites" },
      { setting_key: "COMPANY_IMAGE", setting_value: "" },
      { setting_key: "REGISTRATION_ENABLED", setting_value: "false" },
      { setting_key: "MONTHLY_INVOICE_EMAIL_REMINDER_ENABLED", setting_value: "true" },
    ],
    skipDuplicates: true,
  });

  // ═══════════════════════════════════════════════════════
  // Users (all roles represented)
  // ═══════════════════════════════════════════════════════

  const hashedPassword = await bcrypt.hash("admin123", 10);
  const staffPassword = await bcrypt.hash("staff123", 10);

  const admin = await prisma.siteUser.upsert({
    where: { email: "admin@micasasuites.com" },
    update: {},
    create: {
      name: "Administrator",
      email: "admin@micasasuites.com",
      password: hashedPassword,
      role_id: 1,
    },
  });

  const manager = await prisma.siteUser.upsert({
    where: { email: "manager@micasasuites.com" },
    update: {},
    create: {
      name: "Budi Santoso",
      email: "manager@micasasuites.com",
      password: staffPassword,
      role_id: 2,
    },
  });

  const staffUser = await prisma.siteUser.upsert({
    where: { email: "staff@micasasuites.com" },
    update: {},
    create: {
      name: "Siti Rahayu",
      email: "staff@micasasuites.com",
      password: staffPassword,
      role_id: 3,
    },
  });

  const viewer = await prisma.siteUser.upsert({
    where: { email: "viewer@micasasuites.com" },
    update: {},
    create: {
      name: "Wati Susanti",
      email: "viewer@micasasuites.com",
      password: staffPassword,
      role_id: 4,
    },
  });

  const resetUser = await prisma.siteUser.upsert({
    where: { email: "newstaff@micasasuites.com" },
    update: {},
    create: {
      name: "Rina Marlina",
      email: "newstaff@micasasuites.com",
      password: staffPassword,
      role_id: 3,
      shouldReset: true,
    },
  });

  // ═══════════════════════════════════════════════════════
  // Locations
  // ═══════════════════════════════════════════════════════

  const loc1 = await prisma.location.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: "Mi Casa Sudirman", address: "Jl. Jend. Sudirman No. 45, Jakarta Selatan", code: "SDK" },
  });

  const loc2 = await prisma.location.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, name: "Mi Casa Kemang", address: "Jl. Kemang Raya No. 12, Jakarta Selatan", code: "KMG" },
  });

  // ═══════════════════════════════════════════════════════
  // User ↔ Location assignments
  // ═══════════════════════════════════════════════════════

  await prisma.userLocation.createMany({
    data: [
      { user_id: admin.id, location_id: loc1.id },
      { user_id: admin.id, location_id: loc2.id },
      { user_id: manager.id, location_id: loc1.id },
      { user_id: manager.id, location_id: loc2.id },
      { user_id: staffUser.id, location_id: loc1.id },
      { user_id: viewer.id, location_id: loc1.id },
      { user_id: resetUser.id, location_id: loc2.id },
    ],
    skipDuplicates: true,
  });

  // ═══════════════════════════════════════════════════════
  // Room Types
  // ═══════════════════════════════════════════════════════

  const studio = await prisma.roomType.upsert({
    where: { type: "Studio" },
    update: {},
    create: { type: "Studio", description: "Kamar studio kompak dengan kitchenette" },
  });

  const oneBR = await prisma.roomType.upsert({
    where: { type: "1 Bedroom" },
    update: {},
    create: { type: "1 Bedroom", description: "Satu kamar tidur dengan ruang tamu terpisah" },
  });

  const twoBR = await prisma.roomType.upsert({
    where: { type: "2 Bedroom" },
    update: {},
    create: { type: "2 Bedroom", description: "Dua kamar tidur, cocok untuk keluarga" },
  });

  // ═══════════════════════════════════════════════════════
  // Durations
  // ═══════════════════════════════════════════════════════

  const dur3 = await prisma.duration.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, duration: "3 Bulan", month_count: 3 },
  });

  const dur6 = await prisma.duration.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, duration: "6 Bulan", month_count: 6 },
  });

  const dur12 = await prisma.duration.upsert({
    where: { id: 3 },
    update: {},
    create: { id: 3, duration: "1 Tahun", month_count: 12 },
  });

  // ═══════════════════════════════════════════════════════
  // Room Type Durations (pricing matrix)
  // ═══════════════════════════════════════════════════════

  const rtdData = [
    { room_type_id: studio.id, duration_id: dur3.id, suggested_price: 4500000, location_id: loc1.id },
    { room_type_id: studio.id, duration_id: dur6.id, suggested_price: 4000000, location_id: loc1.id },
    { room_type_id: studio.id, duration_id: dur12.id, suggested_price: 3500000, location_id: loc1.id },
    { room_type_id: oneBR.id, duration_id: dur3.id, suggested_price: 7000000, location_id: loc1.id },
    { room_type_id: oneBR.id, duration_id: dur6.id, suggested_price: 6500000, location_id: loc1.id },
    { room_type_id: oneBR.id, duration_id: dur12.id, suggested_price: 6000000, location_id: loc1.id },
    { room_type_id: twoBR.id, duration_id: dur3.id, suggested_price: 10000000, location_id: loc1.id },
    { room_type_id: twoBR.id, duration_id: dur6.id, suggested_price: 9000000, location_id: loc1.id },
    { room_type_id: twoBR.id, duration_id: dur12.id, suggested_price: 8000000, location_id: loc1.id },
    { room_type_id: studio.id, duration_id: dur3.id, suggested_price: 5000000, location_id: loc2.id },
    { room_type_id: studio.id, duration_id: dur6.id, suggested_price: 4500000, location_id: loc2.id },
    { room_type_id: studio.id, duration_id: dur12.id, suggested_price: 4000000, location_id: loc2.id },
    { room_type_id: oneBR.id, duration_id: dur3.id, suggested_price: 8000000, location_id: loc2.id },
    { room_type_id: oneBR.id, duration_id: dur6.id, suggested_price: 7500000, location_id: loc2.id },
    { room_type_id: oneBR.id, duration_id: dur12.id, suggested_price: 7000000, location_id: loc2.id },
  ];

  for (const rtd of rtdData) {
    await prisma.roomTypeDuration.upsert({
      where: {
        room_type_id_duration_id_location_id: {
          room_type_id: rtd.room_type_id,
          duration_id: rtd.duration_id,
          location_id: rtd.location_id,
        },
      },
      update: {},
      create: rtd,
    });
  }

  // ═══════════════════════════════════════════════════════
  // Rooms — Location 1 (Sudirman) + Location 2 (Kemang)
  // ═══════════════════════════════════════════════════════

  const rooms: { room_number: string; room_type_id: number; status_id: number; location_id: number }[] = [
    // Sudirman
    { room_number: "101", room_type_id: studio.id, status_id: 2, location_id: loc1.id },
    { room_number: "102", room_type_id: studio.id, status_id: 2, location_id: loc1.id },
    { room_number: "103", room_type_id: studio.id, status_id: 1, location_id: loc1.id },
    { room_number: "104", room_type_id: studio.id, status_id: 1, location_id: loc1.id },
    { room_number: "201", room_type_id: oneBR.id, status_id: 2, location_id: loc1.id },
    { room_number: "202", room_type_id: oneBR.id, status_id: 2, location_id: loc1.id },
    { room_number: "203", room_type_id: oneBR.id, status_id: 1, location_id: loc1.id },
    { room_number: "301", room_type_id: twoBR.id, status_id: 2, location_id: loc1.id },
    { room_number: "302", room_type_id: twoBR.id, status_id: 3, location_id: loc1.id },
    // Kemang
    { room_number: "A1", room_type_id: studio.id, status_id: 2, location_id: loc2.id },
    { room_number: "A2", room_type_id: studio.id, status_id: 2, location_id: loc2.id },
    { room_number: "A3", room_type_id: studio.id, status_id: 1, location_id: loc2.id },
    { room_number: "B1", room_type_id: oneBR.id, status_id: 2, location_id: loc2.id },
    { room_number: "B2", room_type_id: oneBR.id, status_id: 2, location_id: loc2.id },
    { room_number: "B3", room_type_id: oneBR.id, status_id: 1, location_id: loc2.id },
  ];

  const createdRooms: Record<string, number> = {};
  for (const room of rooms) {
    const r = await prisma.room.upsert({
      where: { room_number_location_id: { room_number: room.room_number, location_id: room.location_id } },
      update: {},
      create: room,
    });
    createdRooms[`${room.location_id}-${room.room_number}`] = r.id;
  }

  // ═══════════════════════════════════════════════════════
  // Tenants (varied profiles: some with second residents, emergency contacts, referrals)
  // ═══════════════════════════════════════════════════════

  const tenantData = [
    {
      name: "Ahmad Wijaya",
      email: "ahmad.wijaya@gmail.com",
      phone: "+6281234567890",
      id_number: "3174012345670001",
      current_address: "Jl. Gatot Subroto No. 10, Jakarta",
      emergency_contact_name: "Nurul Wijaya",
      emergency_contact_phone: "+6281234567891",
      referral_source: "Website",
    },
    {
      name: "Diana Putri",
      email: "diana.putri@yahoo.com",
      phone: "+6285678901234",
      id_number: "3174012345670002",
      current_address: "Jl. Thamrin No. 5, Jakarta",
      emergency_contact_name: "Ibu Putri",
      emergency_contact_phone: "+6285678901235",
      referral_source: "Teman",
      second_resident_name: "Eko Prasetyo",
      second_resident_relation: "Suami",
      second_resident_email: "eko.p@yahoo.com",
      second_resident_phone: "+6285678901236",
      second_resident_id_number: "3174012345670009",
    },
    {
      name: "Reza Firmansyah",
      email: "reza.f@outlook.com",
      phone: "+6287654321098",
      id_number: "3174012345670003",
      current_address: "Jl. Rasuna Said Kav. B2, Jakarta",
      emergency_contact_name: "Firmansyah Sr.",
      emergency_contact_phone: "+6287654321099",
      referral_source: "Google",
    },
    {
      name: "Maya Sari",
      email: "maya.sari@gmail.com",
      phone: "+6281122334455",
      id_number: "3174012345670004",
      emergency_contact_name: "Dodi Sari",
      emergency_contact_phone: "+6281122334456",
      referral_source: "Instagram",
    },
    {
      name: "Kevin Hartanto",
      email: "kevin.h@gmail.com",
      phone: "+6289988776655",
      id_number: "3174012345670005",
      current_address: "Jl. HR Rasuna Said No. 3, Jakarta",
      emergency_contact_name: "Hartanto Family",
      emergency_contact_phone: "+6289988776656",
      referral_source: "Agent",
      second_resident_name: "Linda Hartanto",
      second_resident_relation: "Istri",
      second_resident_email: "linda.h@gmail.com",
      second_resident_phone: "+6289988776657",
      second_resident_id_number: "3174012345670010",
    },
    {
      name: "Lisa Anggraini",
      email: "lisa.a@hotmail.com",
      phone: "+6282233445566",
      id_number: "3174012345670006",
      referral_source: "Walk-in",
    },
    {
      name: "Andi Prasetyo",
      email: "andi.p@gmail.com",
      phone: "+6281987654321",
      id_number: "3174012345670007",
      current_address: "Jl. Senopati No. 22, Jakarta",
      emergency_contact_name: "Prasetyo Family",
      emergency_contact_phone: "+6281987654322",
      referral_source: "Website",
    },
    {
      name: "Dewi Lestari",
      email: "dewi.l@gmail.com",
      phone: "+6285511223344",
      id_number: "3174012345670008",
      current_address: "Jl. Panglima Polim No. 7, Jakarta",
      emergency_contact_name: "Pak Lestari",
      emergency_contact_phone: "+6285511223345",
      referral_source: "Tokopedia",
    },
    {
      name: "Fajar Nugroho",
      email: "fajar.n@gmail.com",
      phone: "+6281555666777",
      id_number: "3174012345670011",
      current_address: "Jl. Wolter Monginsidi No. 15, Jakarta",
      referral_source: "Website",
    },
    {
      name: "Citra Dewantara",
      email: "citra.d@outlook.com",
      phone: "+6287123456789",
      id_number: "3174012345670012",
      emergency_contact_name: "Dewantara Family",
      emergency_contact_phone: "+6287123456780",
      referral_source: "Google",
    },
  ];

  const createdTenants: string[] = [];
  for (const t of tenantData) {
    const tenant = await prisma.tenant.upsert({
      where: { id: t.id_number },
      update: {},
      create: { id: t.id_number, ...t },
    });
    createdTenants.push(tenant.id);
  }

  // ═══════════════════════════════════════════════════════
  // Add-ons (with parent-child and varied pricing)
  // ═══════════════════════════════════════════════════════

  // Location 1 add-ons
  const parkingAddon = await prisma.addOn.upsert({
    where: { name_location_id: { name: "Parkir Mobil", location_id: loc1.id } },
    update: {},
    create: {
      name: "Parkir Mobil",
      description: "Slot parkir mobil di basement",
      location_id: loc1.id,
      requires_input: true,
      pricing: {
        create: [
          { price: 500000, interval_start: 0, interval_end: 6, is_full_payment: false },
          { price: 400000, interval_start: 6, interval_end: null, is_full_payment: false },
        ],
      },
    },
  });

  const motorAddon = await prisma.addOn.upsert({
    where: { name_location_id: { name: "Parkir Motor", location_id: loc1.id } },
    update: {},
    create: {
      name: "Parkir Motor",
      description: "Slot parkir motor",
      location_id: loc1.id,
      requires_input: true,
      parent_addon_id: parkingAddon.id,
      pricing: {
        create: [
          { price: 150000, interval_start: 0, interval_end: null, is_full_payment: false },
        ],
      },
    },
  });

  const laundryAddon = await prisma.addOn.upsert({
    where: { name_location_id: { name: "Laundry", location_id: loc1.id } },
    update: {},
    create: {
      name: "Laundry",
      description: "Layanan laundry bulanan 10kg",
      location_id: loc1.id,
      requires_input: false,
      pricing: {
        create: [
          { price: 250000, interval_start: 0, interval_end: null, is_full_payment: false },
        ],
      },
    },
  });

  const internetAddon = await prisma.addOn.upsert({
    where: { name_location_id: { name: "Internet Upgrade", location_id: loc1.id } },
    update: {},
    create: {
      name: "Internet Upgrade",
      description: "Upgrade ke 100 Mbps dedicated",
      location_id: loc1.id,
      requires_input: false,
      pricing: {
        create: [
          { price: 150000, interval_start: 0, interval_end: 3, is_full_payment: false },
          { price: 100000, interval_start: 3, interval_end: null, is_full_payment: false },
        ],
      },
    },
  });

  const cleaningAddon = await prisma.addOn.upsert({
    where: { name_location_id: { name: "Extra Cleaning", location_id: loc1.id } },
    update: {},
    create: {
      name: "Extra Cleaning",
      description: "Tambahan cleaning service 2x/minggu",
      location_id: loc1.id,
      requires_input: false,
      pricing: {
        create: [
          { price: 350000, interval_start: 0, interval_end: null, is_full_payment: false },
        ],
      },
    },
  });

  // Location 2 add-ons
  const parkingAddonL2 = await prisma.addOn.upsert({
    where: { name_location_id: { name: "Parkir Mobil", location_id: loc2.id } },
    update: {},
    create: {
      name: "Parkir Mobil",
      description: "Slot parkir mobil outdoor",
      location_id: loc2.id,
      requires_input: true,
      pricing: {
        create: [
          { price: 600000, interval_start: 0, interval_end: null, is_full_payment: false },
        ],
      },
    },
  });

  const gymAddon = await prisma.addOn.upsert({
    where: { name_location_id: { name: "Gym Access", location_id: loc2.id } },
    update: {},
    create: {
      name: "Gym Access",
      description: "Akses gym 24 jam",
      location_id: loc2.id,
      requires_input: false,
      pricing: {
        create: [
          { price: 200000, interval_start: 0, interval_end: null, is_full_payment: false },
        ],
      },
    },
  });

  // ═══════════════════════════════════════════════════════
  // Billing Policies (location-level and booking-level overrides)
  // ═══════════════════════════════════════════════════════

  await prisma.billingPolicy.create({
    data: {
      location_id: loc1.id,
      late_fee_type: "FIXED",
      late_fee_amount: 200000,
      grace_period_days: 7,
      billing_cycle_day: 1,
      proration_method: "DAILY",
      tax_rate: 11.0,
      reminder_days_before: 5,
    },
  });

  await prisma.billingPolicy.create({
    data: {
      location_id: loc2.id,
      late_fee_type: "PERCENTAGE",
      late_fee_amount: 5.0,
      grace_period_days: 5,
      billing_cycle_day: 1,
      proration_method: "DAILY",
      tax_rate: 11.0,
      reminder_days_before: 7,
    },
  });

  // ═══════════════════════════════════════════════════════
  // Bookings (all statuses: active, pending, completed, cancelled, rolling)
  // ═══════════════════════════════════════════════════════

  // Active bookings — Location 1
  const booking1 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc1.id}-101`],
      tenant_id: createdTenants[0],
      start_date: new Date("2026-01-01"),
      end_date: new Date("2026-12-31"),
      duration_id: dur12.id,
      status_id: 2,
      fee: 3500000,
    },
  });

  const booking2 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc1.id}-102`],
      tenant_id: createdTenants[1],
      start_date: new Date("2026-03-01"),
      end_date: new Date("2026-08-31"),
      duration_id: dur6.id,
      status_id: 2,
      fee: 4000000,
      second_resident_fee: 500000,
    },
  });

  const booking3 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc1.id}-201`],
      tenant_id: createdTenants[2],
      start_date: new Date("2026-02-01"),
      end_date: new Date("2027-01-31"),
      duration_id: dur12.id,
      status_id: 2,
      fee: 6000000,
    },
  });

  const booking4 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc1.id}-202`],
      tenant_id: createdTenants[3],
      start_date: new Date("2026-04-01"),
      end_date: new Date("2026-09-30"),
      duration_id: dur6.id,
      status_id: 2,
      fee: 6500000,
    },
  });

  const booking5 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc1.id}-301`],
      tenant_id: createdTenants[4],
      start_date: new Date("2026-01-15"),
      end_date: new Date("2027-01-14"),
      duration_id: dur12.id,
      status_id: 2,
      fee: 8000000,
      second_resident_fee: 750000,
      is_rolling: true,
    },
  });

  // Active bookings — Location 2
  const booking6 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc2.id}-A1`],
      tenant_id: createdTenants[5],
      start_date: new Date("2026-02-01"),
      end_date: new Date("2026-07-31"),
      duration_id: dur6.id,
      status_id: 2,
      fee: 4500000,
    },
  });

  const booking7 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc2.id}-B1`],
      tenant_id: createdTenants[6],
      start_date: new Date("2026-03-01"),
      end_date: new Date("2027-02-28"),
      duration_id: dur12.id,
      status_id: 2,
      fee: 7000000,
    },
  });

  const booking8 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc2.id}-B2`],
      tenant_id: createdTenants[7],
      start_date: new Date("2026-05-01"),
      end_date: new Date("2026-07-31"),
      duration_id: dur3.id,
      status_id: 2,
      fee: 7500000,
    },
  });

  const booking9 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc2.id}-A2`],
      tenant_id: createdTenants[8],
      start_date: new Date("2026-04-01"),
      end_date: new Date("2026-09-30"),
      duration_id: dur6.id,
      status_id: 2,
      fee: 4500000,
      is_rolling: true,
    },
  });

  // Pending booking (not yet checked in)
  const bookingPending = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc1.id}-104`],
      tenant_id: createdTenants[9],
      start_date: new Date("2026-07-01"),
      end_date: new Date("2026-12-31"),
      duration_id: dur6.id,
      status_id: 1,
      fee: 4000000,
    },
  });

  // Completed booking (past)
  const bookingCompleted = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc1.id}-103`],
      tenant_id: createdTenants[0],
      start_date: new Date("2025-06-01"),
      end_date: new Date("2025-11-30"),
      duration_id: dur6.id,
      status_id: 3,
      fee: 4000000,
    },
  });

  // Cancelled booking
  const bookingCancelled = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc1.id}-203`],
      tenant_id: createdTenants[9],
      start_date: new Date("2026-01-01"),
      end_date: new Date("2026-06-30"),
      duration_id: dur6.id,
      status_id: 4,
      fee: 6500000,
    },
  });

  // Booking-level billing policy override
  await prisma.billingPolicy.create({
    data: {
      booking_id: booking5.id,
      rate_escalation_percentage: 5.0,
      rate_escalation_frequency: 12,
      grace_period_days: 14,
    },
  });

  // ═══════════════════════════════════════════════════════
  // Booking Add-ons (various types, rolling and fixed)
  // ═══════════════════════════════════════════════════════

  await prisma.bookingAddOn.create({
    data: {
      addon_id: parkingAddon.id,
      booking_id: booking1.id,
      start_date: new Date("2026-01-01"),
      end_date: new Date("2026-12-31"),
      input: "B 1234 ABC",
    },
  });

  await prisma.bookingAddOn.create({
    data: {
      addon_id: laundryAddon.id,
      booking_id: booking1.id,
      start_date: new Date("2026-03-01"),
      is_rolling: true,
    },
  });

  await prisma.bookingAddOn.create({
    data: {
      addon_id: motorAddon.id,
      booking_id: booking2.id,
      start_date: new Date("2026-03-01"),
      end_date: new Date("2026-08-31"),
      input: "B 5678 DEF",
    },
  });

  await prisma.bookingAddOn.create({
    data: {
      addon_id: laundryAddon.id,
      booking_id: booking3.id,
      start_date: new Date("2026-02-01"),
      end_date: new Date("2027-01-31"),
    },
  });

  await prisma.bookingAddOn.create({
    data: {
      addon_id: internetAddon.id,
      booking_id: booking5.id,
      start_date: new Date("2026-01-15"),
      is_rolling: true,
    },
  });

  await prisma.bookingAddOn.create({
    data: {
      addon_id: cleaningAddon.id,
      booking_id: booking5.id,
      start_date: new Date("2026-01-15"),
      end_date: new Date("2027-01-14"),
    },
  });

  await prisma.bookingAddOn.create({
    data: {
      addon_id: parkingAddonL2.id,
      booking_id: booking7.id,
      start_date: new Date("2026-03-01"),
      end_date: new Date("2027-02-28"),
      input: "B 9012 GHI",
    },
  });

  await prisma.bookingAddOn.create({
    data: {
      addon_id: gymAddon.id,
      booking_id: booking6.id,
      start_date: new Date("2026-02-01"),
      is_rolling: true,
    },
  });

  // ═══════════════════════════════════════════════════════
  // Deposits (all statuses represented)
  // ═══════════════════════════════════════════════════════

  await prisma.deposit.create({ data: { booking_id: booking1.id, amount: 3500000, status: DepositStatus.HELD } });
  await prisma.deposit.create({ data: { booking_id: booking2.id, amount: 4000000, status: DepositStatus.HELD } });
  await prisma.deposit.create({ data: { booking_id: booking3.id, amount: 6000000, status: DepositStatus.HELD } });
  await prisma.deposit.create({ data: { booking_id: booking4.id, amount: 6500000, status: DepositStatus.HELD } });
  await prisma.deposit.create({ data: { booking_id: booking5.id, amount: 8000000, status: DepositStatus.HELD } });
  await prisma.deposit.create({ data: { booking_id: booking6.id, amount: 4500000, status: DepositStatus.HELD } });
  await prisma.deposit.create({ data: { booking_id: booking7.id, amount: 7000000, status: DepositStatus.UNPAID } });
  await prisma.deposit.create({ data: { booking_id: booking8.id, amount: 7500000, status: DepositStatus.HELD } });
  await prisma.deposit.create({ data: { booking_id: booking9.id, amount: 4500000, status: DepositStatus.HELD } });
  await prisma.deposit.create({ data: { booking_id: bookingPending.id, amount: 4000000, status: DepositStatus.UNPAID } });
  await prisma.deposit.create({
    data: {
      booking_id: bookingCompleted.id,
      amount: 4000000,
      status: DepositStatus.REFUNDED,
      refunded_amount: 4000000,
      refunded_at: new Date("2025-12-05"),
    },
  });
  await prisma.deposit.create({
    data: {
      booking_id: bookingCancelled.id,
      amount: 6500000,
      status: DepositStatus.PARTIALLY_REFUNDED,
      refunded_amount: 5000000,
      refunded_at: new Date("2026-01-15"),
    },
  });

  // ═══════════════════════════════════════════════════════
  // Bills & Bill Items (monthly bills for active bookings)
  // ═══════════════════════════════════════════════════════

  const activeBookings = [
    { booking: booking1, fee: 3500000, start: new Date("2026-01-01"), locationId: loc1.id },
    { booking: booking2, fee: 4500000, start: new Date("2026-03-01"), locationId: loc1.id },
    { booking: booking3, fee: 6000000, start: new Date("2026-02-01"), locationId: loc1.id },
    { booking: booking4, fee: 6500000, start: new Date("2026-04-01"), locationId: loc1.id },
    { booking: booking5, fee: 8000000, start: new Date("2026-01-15"), locationId: loc1.id },
    { booking: booking6, fee: 4500000, start: new Date("2026-02-01"), locationId: loc2.id },
    { booking: booking7, fee: 7000000, start: new Date("2026-03-01"), locationId: loc2.id },
    { booking: booking8, fee: 7500000, start: new Date("2026-05-01"), locationId: loc2.id },
    { booking: booking9, fee: 4500000, start: new Date("2026-04-01"), locationId: loc2.id },
  ];

  const today = new Date("2026-06-15");
  let invoiceCounter: Record<string, number> = {};

  for (const { booking, fee, start, locationId } of activeBookings) {
    let current = new Date(start);
    while (current <= today) {
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      const dueDate = monthEnd;
      const monthName = current.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
      const locCode = locationId === loc1.id ? "SDK" : "KMG";
      const yearMonth = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
      const key = `${locCode}-${yearMonth}`;
      invoiceCounter[key] = (invoiceCounter[key] || 0) + 1;
      const invoiceNumber = `INV/${locCode}/${yearMonth}/${String(invoiceCounter[key]).padStart(4, "0")}`;

      const bill = await prisma.bill.create({
        data: {
          booking_id: booking.id,
          description: `Tagihan untuk Bulan ${monthName}`,
          due_date: dueDate,
          invoice_number: invoiceNumber,
          bill_item: {
            create: [
              {
                description: `Sewa kamar - ${monthName}`,
                amount: fee,
                type: BillType.GENERATED,
              },
            ],
          },
        },
      });

      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
  }

  // Add add-on bill items to booking1's bills (parking)
  const booking1Bills = await prisma.bill.findMany({
    where: { booking_id: booking1.id, deletedAt: null },
    orderBy: { due_date: "asc" },
  });
  for (const bill of booking1Bills) {
    await prisma.billItem.create({
      data: {
        bill_id: bill.id,
        description: "Parkir Mobil (B 1234 ABC)",
        amount: 500000,
        type: BillType.GENERATED,
        related_id: { addon_id: parkingAddon.id },
      },
    });
  }

  // Add laundry to booking1 bills from March onwards
  const booking1BillsMar = booking1Bills.filter(b => b.due_date >= new Date("2026-03-01"));
  for (const bill of booking1BillsMar) {
    await prisma.billItem.create({
      data: {
        bill_id: bill.id,
        description: "Laundry",
        amount: 250000,
        type: BillType.GENERATED,
        related_id: { addon_id: laundryAddon.id },
      },
    });
  }

  // Add internet + cleaning to booking5's bills
  const booking5Bills = await prisma.bill.findMany({
    where: { booking_id: booking5.id, deletedAt: null },
    orderBy: { due_date: "asc" },
  });
  for (let i = 0; i < booking5Bills.length; i++) {
    await prisma.billItem.create({
      data: {
        bill_id: booking5Bills[i].id,
        description: "Internet Upgrade (100 Mbps)",
        amount: i < 3 ? 150000 : 100000,
        type: BillType.GENERATED,
        related_id: { addon_id: internetAddon.id },
      },
    });
    await prisma.billItem.create({
      data: {
        bill_id: booking5Bills[i].id,
        description: "Extra Cleaning (2x/minggu)",
        amount: 350000,
        type: BillType.GENERATED,
        related_id: { addon_id: cleaningAddon.id },
      },
    });
  }

  // Manual (CREATED) bill item on booking3 — one-off repair charge
  const booking3Bills = await prisma.bill.findMany({
    where: { booking_id: booking3.id, deletedAt: null },
    orderBy: { due_date: "asc" },
  });
  if (booking3Bills.length > 2) {
    await prisma.billItem.create({
      data: {
        bill_id: booking3Bills[2].id,
        description: "Biaya perbaikan kunci pintu",
        amount: 350000,
        type: BillType.CREATED,
        internal_description: "Tenant broke lock, charged replacement cost",
      },
    });
  }

  // ═══════════════════════════════════════════════════════
  // Payments (full, partial, multi-bill, pending, rejected, all methods)
  // ═══════════════════════════════════════════════════════

  // Booking 1: paid all months through May (bank transfer)
  const booking1PaidBills = booking1Bills.slice(0, 5);
  for (const bill of booking1PaidBills) {
    const payment = await prisma.payment.create({
      data: {
        booking_id: booking1.id,
        amount: 4000000,
        payment_date: new Date(bill.due_date.getFullYear(), bill.due_date.getMonth(), 5),
        status_id: 2,
        payment_method: PaymentMethod.BANK_TRANSFER,
      },
    });
    await prisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill.id, amount: 4000000 },
    });
  }

  // Booking 2: paid first 2 months (ewallet)
  const booking2Bills = await prisma.bill.findMany({
    where: { booking_id: booking2.id, deletedAt: null },
    orderBy: { due_date: "asc" },
  });
  for (const bill of booking2Bills.slice(0, 2)) {
    const payment = await prisma.payment.create({
      data: {
        booking_id: booking2.id,
        amount: 4500000,
        payment_date: new Date(bill.due_date.getFullYear(), bill.due_date.getMonth(), 3),
        status_id: 2,
        payment_method: PaymentMethod.EWALLET,
      },
    });
    await prisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill.id, amount: 4500000 },
    });
  }

  // Booking 3: paid through April, May pending
  for (const bill of booking3Bills.slice(0, 3)) {
    const payment = await prisma.payment.create({
      data: {
        booking_id: booking3.id,
        amount: 6000000,
        payment_date: new Date(bill.due_date.getFullYear(), bill.due_date.getMonth(), 1),
        status_id: 2,
        payment_method: PaymentMethod.BANK_TRANSFER,
      },
    });
    await prisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill.id, amount: 6000000 },
    });
  }
  if (booking3Bills.length > 3) {
    const pendingPayment = await prisma.payment.create({
      data: {
        booking_id: booking3.id,
        amount: 6000000,
        payment_date: new Date("2026-05-28"),
        status_id: 1,
        payment_method: PaymentMethod.BANK_TRANSFER,
        payment_proof: "/uploads/proof_booking3_may.jpg",
      },
    });
    await prisma.paymentBill.create({
      data: { payment_id: pendingPayment.id, bill_id: booking3Bills[3].id, amount: 6000000 },
    });
  }

  // Booking 5: bulk payment covering 3 months (cash)
  if (booking5Bills.length >= 3) {
    const bulkPayment = await prisma.payment.create({
      data: {
        booking_id: booking5.id,
        amount: 25350000,
        payment_date: new Date("2026-01-20"),
        status_id: 2,
        payment_method: PaymentMethod.CASH,
        allocation_mode: "manual",
      },
    });
    for (const bill of booking5Bills.slice(0, 3)) {
      await prisma.paymentBill.create({
        data: { payment_id: bulkPayment.id, bill_id: bill.id, amount: 8450000 },
      });
    }
  }

  // Booking 4: rejected payment
  await prisma.payment.create({
    data: {
      booking_id: booking4.id,
      amount: 6500000,
      payment_date: new Date("2026-04-10"),
      status_id: 3,
      payment_method: PaymentMethod.BANK_TRANSFER,
      payment_proof: "/uploads/proof_booking4_rejected.jpg",
    },
  });

  // Booking 6: paid in full with one payment (Location 2)
  const booking6Bills = await prisma.bill.findMany({
    where: { booking_id: booking6.id, deletedAt: null },
    orderBy: { due_date: "asc" },
  });
  for (const bill of booking6Bills.slice(0, 3)) {
    const payment = await prisma.payment.create({
      data: {
        booking_id: booking6.id,
        amount: 4500000,
        payment_date: new Date(bill.due_date.getFullYear(), bill.due_date.getMonth(), 2),
        status_id: 2,
        payment_method: PaymentMethod.EWALLET,
      },
    });
    await prisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill.id, amount: 4500000 },
    });
  }

  // Booking 7: paid first month only
  const booking7Bills = await prisma.bill.findMany({
    where: { booking_id: booking7.id, deletedAt: null },
    orderBy: { due_date: "asc" },
  });
  if (booking7Bills.length > 0) {
    const p = await prisma.payment.create({
      data: {
        booking_id: booking7.id,
        amount: 7000000,
        payment_date: new Date("2026-03-05"),
        status_id: 2,
        payment_method: PaymentMethod.CASH,
      },
    });
    await prisma.paymentBill.create({
      data: { payment_id: p.id, bill_id: booking7Bills[0].id, amount: 7000000 },
    });
  }

  // ═══════════════════════════════════════════════════════
  // Meter Readings (electricity and water for multiple bookings)
  // ═══════════════════════════════════════════════════════

  const meterReadings = [
    // Booking 1 - electricity
    { booking_id: booking1.id, utility_type: "electricity", reading_date: new Date("2026-02-01"), reading_value: 1250, previous_value: 1100, rate_per_unit: 1500 },
    { booking_id: booking1.id, utility_type: "electricity", reading_date: new Date("2026-03-01"), reading_value: 1420, previous_value: 1250, rate_per_unit: 1500 },
    { booking_id: booking1.id, utility_type: "electricity", reading_date: new Date("2026-04-01"), reading_value: 1580, previous_value: 1420, rate_per_unit: 1500 },
    { booking_id: booking1.id, utility_type: "electricity", reading_date: new Date("2026-05-01"), reading_value: 1760, previous_value: 1580, rate_per_unit: 1500 },
    { booking_id: booking1.id, utility_type: "electricity", reading_date: new Date("2026-06-01"), reading_value: 1950, previous_value: 1760, rate_per_unit: 1500 },
    // Booking 1 - water
    { booking_id: booking1.id, utility_type: "water", reading_date: new Date("2026-02-01"), reading_value: 45, previous_value: 38, rate_per_unit: 12500 },
    { booking_id: booking1.id, utility_type: "water", reading_date: new Date("2026-03-01"), reading_value: 52, previous_value: 45, rate_per_unit: 12500 },
    { booking_id: booking1.id, utility_type: "water", reading_date: new Date("2026-04-01"), reading_value: 60, previous_value: 52, rate_per_unit: 12500 },
    { booking_id: booking1.id, utility_type: "water", reading_date: new Date("2026-05-01"), reading_value: 67, previous_value: 60, rate_per_unit: 12500 },
    { booking_id: booking1.id, utility_type: "water", reading_date: new Date("2026-06-01"), reading_value: 75, previous_value: 67, rate_per_unit: 12500 },
    // Booking 3 - electricity
    { booking_id: booking3.id, utility_type: "electricity", reading_date: new Date("2026-03-01"), reading_value: 2100, previous_value: 1900, rate_per_unit: 1500 },
    { booking_id: booking3.id, utility_type: "electricity", reading_date: new Date("2026-04-01"), reading_value: 2320, previous_value: 2100, rate_per_unit: 1500 },
    { booking_id: booking3.id, utility_type: "electricity", reading_date: new Date("2026-05-01"), reading_value: 2510, previous_value: 2320, rate_per_unit: 1500 },
    { booking_id: booking3.id, utility_type: "electricity", reading_date: new Date("2026-06-01"), reading_value: 2700, previous_value: 2510, rate_per_unit: 1500 },
    // Booking 5 - electricity (large 2BR)
    { booking_id: booking5.id, utility_type: "electricity", reading_date: new Date("2026-02-01"), reading_value: 3200, previous_value: 2900, rate_per_unit: 1500 },
    { booking_id: booking5.id, utility_type: "electricity", reading_date: new Date("2026-03-01"), reading_value: 3520, previous_value: 3200, rate_per_unit: 1500 },
    { booking_id: booking5.id, utility_type: "electricity", reading_date: new Date("2026-04-01"), reading_value: 3850, previous_value: 3520, rate_per_unit: 1500 },
    { booking_id: booking5.id, utility_type: "electricity", reading_date: new Date("2026-05-01"), reading_value: 4180, previous_value: 3850, rate_per_unit: 1500 },
    { booking_id: booking5.id, utility_type: "electricity", reading_date: new Date("2026-06-01"), reading_value: 4500, previous_value: 4180, rate_per_unit: 1500 },
    // Booking 5 - water
    { booking_id: booking5.id, utility_type: "water", reading_date: new Date("2026-02-01"), reading_value: 120, previous_value: 105, rate_per_unit: 12500 },
    { booking_id: booking5.id, utility_type: "water", reading_date: new Date("2026-03-01"), reading_value: 136, previous_value: 120, rate_per_unit: 12500 },
    { booking_id: booking5.id, utility_type: "water", reading_date: new Date("2026-04-01"), reading_value: 150, previous_value: 136, rate_per_unit: 12500 },
    { booking_id: booking5.id, utility_type: "water", reading_date: new Date("2026-05-01"), reading_value: 168, previous_value: 150, rate_per_unit: 12500 },
    { booking_id: booking5.id, utility_type: "water", reading_date: new Date("2026-06-01"), reading_value: 183, previous_value: 168, rate_per_unit: 12500 },
  ];

  for (const mr of meterReadings) {
    await prisma.meterReading.create({ data: mr });
  }

  // ═══════════════════════════════════════════════════════
  // Guests & Guest Stays
  // ═══════════════════════════════════════════════════════

  const guest1 = await prisma.guest.create({
    data: {
      name: "John Smith",
      email: "john.smith@email.com",
      phone: "+1234567890",
      booking_id: booking1.id,
    },
  });

  await prisma.guestStay.create({
    data: {
      guest_id: guest1.id,
      start_date: new Date("2026-03-10"),
      end_date: new Date("2026-03-15"),
      daily_fee: 75000,
    },
  });

  await prisma.guestStay.create({
    data: {
      guest_id: guest1.id,
      start_date: new Date("2026-06-01"),
      end_date: new Date("2026-06-20"),
      daily_fee: 75000,
    },
  });

  const guest2 = await prisma.guest.create({
    data: {
      name: "Tanaka Yuki",
      email: "tanaka.y@email.jp",
      booking_id: booking3.id,
    },
  });

  await prisma.guestStay.create({
    data: {
      guest_id: guest2.id,
      start_date: new Date("2026-05-20"),
      end_date: new Date("2026-07-10"),
      daily_fee: 100000,
    },
  });

  const guest3 = await prisma.guest.create({
    data: {
      name: "Park Soo-jin",
      email: "soojin.park@email.kr",
      phone: "+821012345678",
      booking_id: booking5.id,
    },
  });

  await prisma.guestStay.create({
    data: {
      guest_id: guest3.id,
      start_date: new Date("2026-04-01"),
      end_date: new Date("2026-04-14"),
      daily_fee: 100000,
    },
  });

  const guest4 = await prisma.guest.create({
    data: {
      name: "Maria Garcia",
      email: "maria.g@email.es",
      phone: "+34612345678",
      booking_id: booking7.id,
    },
  });

  await prisma.guestStay.create({
    data: {
      guest_id: guest4.id,
      start_date: new Date("2026-06-10"),
      end_date: new Date("2026-06-25"),
      daily_fee: 85000,
    },
  });

  // ═══════════════════════════════════════════════════════
  // Check-in/Check-out Logs
  // ═══════════════════════════════════════════════════════

  await prisma.checkInOutLog.createMany({
    data: [
      { booking_id: booking1.id, event_type: "CHECK_IN", event_date: new Date("2026-01-01"), tenant_id: createdTenants[0] },
      { booking_id: booking2.id, event_type: "CHECK_IN", event_date: new Date("2026-03-01"), tenant_id: createdTenants[1] },
      { booking_id: booking3.id, event_type: "CHECK_IN", event_date: new Date("2026-02-01"), tenant_id: createdTenants[2] },
      { booking_id: booking4.id, event_type: "CHECK_IN", event_date: new Date("2026-04-01"), tenant_id: createdTenants[3] },
      { booking_id: booking5.id, event_type: "CHECK_IN", event_date: new Date("2026-01-15"), tenant_id: createdTenants[4] },
      { booking_id: booking6.id, event_type: "CHECK_IN", event_date: new Date("2026-02-01"), tenant_id: createdTenants[5] },
      { booking_id: booking7.id, event_type: "CHECK_IN", event_date: new Date("2026-03-01"), tenant_id: createdTenants[6] },
      { booking_id: booking8.id, event_type: "CHECK_IN", event_date: new Date("2026-05-01"), tenant_id: createdTenants[7] },
      { booking_id: booking9.id, event_type: "CHECK_IN", event_date: new Date("2026-04-01"), tenant_id: createdTenants[8] },
      { booking_id: bookingCompleted.id, event_type: "CHECK_IN", event_date: new Date("2025-06-01"), tenant_id: createdTenants[0] },
      { booking_id: bookingCompleted.id, event_type: "CHECK_OUT", event_date: new Date("2025-11-30"), tenant_id: createdTenants[0] },
      { booking_id: bookingCancelled.id, event_type: "CHECK_IN", event_date: new Date("2026-01-01"), tenant_id: createdTenants[9] },
      { booking_id: bookingCancelled.id, event_type: "CHECK_OUT", event_date: new Date("2026-01-10"), tenant_id: createdTenants[9] },
    ],
  });

  // ═══════════════════════════════════════════════════════
  // Penalties (various types)
  // ═══════════════════════════════════════════════════════

  const booking4Bills = await prisma.bill.findMany({
    where: { booking_id: booking4.id, deletedAt: null },
    orderBy: { due_date: "asc" },
  });

  await prisma.penalty.create({
    data: {
      booking_id: booking4.id,
      bill_id: booking4Bills.length > 0 ? booking4Bills[0].id : undefined,
      description: "Keterlambatan pembayaran bulan April 2026",
      amount: 200000,
      penalty_date: new Date("2026-04-08"),
    },
  });

  await prisma.penalty.create({
    data: {
      booking_id: booking4.id,
      description: "Keterlambatan pembayaran bulan Mei 2026",
      amount: 200000,
      penalty_date: new Date("2026-05-08"),
    },
  });

  await prisma.penalty.create({
    data: {
      booking_id: booking7.id,
      description: "Kerusakan furniture - biaya penggantian meja",
      amount: 1500000,
      penalty_date: new Date("2026-05-15"),
    },
  });

  await prisma.penalty.create({
    data: {
      booking_id: bookingCancelled.id,
      description: "Penalti pembatalan kontrak lebih awal",
      amount: 3250000,
      penalty_date: new Date("2026-01-10"),
    },
  });

  // ═══════════════════════════════════════════════════════
  // Transactions (income, expense, credit — all categories)
  // ═══════════════════════════════════════════════════════

  const txData = [
    // === Location 1: Rental income ===
    { amount: 4000000, description: "Pembayaran sewa Kamar 101 - Jan 2026", date: new Date("2026-01-05"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 4000000, description: "Pembayaran sewa Kamar 101 - Feb 2026", date: new Date("2026-02-05"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 4000000, description: "Pembayaran sewa Kamar 101 - Mar 2026", date: new Date("2026-03-05"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 4000000, description: "Pembayaran sewa Kamar 101 - Apr 2026", date: new Date("2026-04-05"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 4000000, description: "Pembayaran sewa Kamar 101 - Mei 2026", date: new Date("2026-05-05"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 4500000, description: "Pembayaran sewa Kamar 102 - Mar 2026", date: new Date("2026-03-03"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 4500000, description: "Pembayaran sewa Kamar 102 - Apr 2026", date: new Date("2026-04-03"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 6000000, description: "Pembayaran sewa Kamar 201 - Feb 2026", date: new Date("2026-02-01"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 6000000, description: "Pembayaran sewa Kamar 201 - Mar 2026", date: new Date("2026-03-01"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 6000000, description: "Pembayaran sewa Kamar 201 - Apr 2026", date: new Date("2026-04-01"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 25350000, description: "Pembayaran sewa Kamar 301 - Jan-Mar 2026 (bulk)", date: new Date("2026-01-20"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    // === Location 1: Deposit income ===
    { amount: 3500000, description: "Deposit Kamar 101 - Ahmad Wijaya", date: new Date("2025-12-28"), type: TransactionType.INCOME, location_id: loc1.id, category: "Deposit" },
    { amount: 4000000, description: "Deposit Kamar 102 - Diana Putri", date: new Date("2026-02-25"), type: TransactionType.INCOME, location_id: loc1.id, category: "Deposit" },
    { amount: 6000000, description: "Deposit Kamar 201 - Reza Firmansyah", date: new Date("2026-01-28"), type: TransactionType.INCOME, location_id: loc1.id, category: "Deposit" },
    { amount: 6500000, description: "Deposit Kamar 202 - Maya Sari", date: new Date("2026-03-28"), type: TransactionType.INCOME, location_id: loc1.id, category: "Deposit" },
    { amount: 8000000, description: "Deposit Kamar 301 - Kevin Hartanto", date: new Date("2026-01-10"), type: TransactionType.INCOME, location_id: loc1.id, category: "Deposit" },
    // === Location 1: Utility expenses ===
    { amount: 2500000, description: "Biaya listrik gedung - Jan 2026", date: new Date("2026-01-25"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 2800000, description: "Biaya listrik gedung - Feb 2026", date: new Date("2026-02-25"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 2600000, description: "Biaya listrik gedung - Mar 2026", date: new Date("2026-03-25"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 2700000, description: "Biaya listrik gedung - Apr 2026", date: new Date("2026-04-25"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 2500000, description: "Biaya listrik gedung - Mei 2026", date: new Date("2026-05-25"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 2550000, description: "Biaya listrik gedung - Jun 2026", date: new Date("2026-06-10"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 1500000, description: "Biaya air - Jan 2026", date: new Date("2026-01-20"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 1600000, description: "Biaya air - Feb 2026", date: new Date("2026-02-20"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 1550000, description: "Biaya air - Mar 2026", date: new Date("2026-03-20"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 1650000, description: "Biaya air - Apr 2026", date: new Date("2026-04-20"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 1500000, description: "Biaya air - Mei 2026", date: new Date("2026-05-20"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    // === Location 1: Maintenance ===
    { amount: 3500000, description: "Perbaikan AC Kamar 302", date: new Date("2026-03-15"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Maintenance" },
    { amount: 750000, description: "Penggantian shower head Kamar 201", date: new Date("2026-04-10"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Maintenance" },
    { amount: 1200000, description: "Perbaikan pipa bocor lantai 2", date: new Date("2026-05-22"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Maintenance" },
    // === Location 1: Operational ===
    { amount: 1200000, description: "Cleaning service - Apr 2026", date: new Date("2026-04-01"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Operasional" },
    { amount: 1200000, description: "Cleaning service - Mei 2026", date: new Date("2026-05-01"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Operasional" },
    { amount: 1200000, description: "Cleaning service - Jun 2026", date: new Date("2026-06-01"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Operasional" },
    { amount: 500000, description: "Keamanan - top up CCTV cloud", date: new Date("2026-05-15"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Operasional" },
    // === Location 1: Salary ===
    { amount: 15000000, description: "Gaji staff - Apr 2026", date: new Date("2026-04-30"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Gaji" },
    { amount: 15000000, description: "Gaji staff - Mei 2026", date: new Date("2026-05-30"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Gaji" },
    { amount: 15000000, description: "Gaji staff - Jun 2026", date: new Date("2026-06-12"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Gaji" },
    // === Location 1: Credit (refunds) ===
    { amount: 4000000, description: "Refund deposit - booking selesai (Ahmad W. - Kamar 103)", date: new Date("2025-12-05"), type: TransactionType.CREDIT, location_id: loc1.id, category: "Deposit" },
    { amount: 5000000, description: "Refund partial deposit - pembatalan (Citra D. - Kamar 203)", date: new Date("2026-01-15"), type: TransactionType.CREDIT, location_id: loc1.id, category: "Deposit" },
    // === Location 2: Rental income ===
    { amount: 4500000, description: "Pembayaran sewa A1 - Feb 2026", date: new Date("2026-02-05"), type: TransactionType.INCOME, location_id: loc2.id, category: "Sewa" },
    { amount: 4500000, description: "Pembayaran sewa A1 - Mar 2026", date: new Date("2026-03-02"), type: TransactionType.INCOME, location_id: loc2.id, category: "Sewa" },
    { amount: 4500000, description: "Pembayaran sewa A1 - Apr 2026", date: new Date("2026-04-02"), type: TransactionType.INCOME, location_id: loc2.id, category: "Sewa" },
    { amount: 7000000, description: "Pembayaran sewa B1 - Mar 2026", date: new Date("2026-03-05"), type: TransactionType.INCOME, location_id: loc2.id, category: "Sewa" },
    { amount: 4500000, description: "Pembayaran sewa A2 - Apr 2026", date: new Date("2026-04-05"), type: TransactionType.INCOME, location_id: loc2.id, category: "Sewa" },
    { amount: 4500000, description: "Pembayaran sewa A2 - Mei 2026", date: new Date("2026-05-03"), type: TransactionType.INCOME, location_id: loc2.id, category: "Sewa" },
    // === Location 2: Deposit ===
    { amount: 4500000, description: "Deposit A1 - Lisa Anggraini", date: new Date("2026-01-28"), type: TransactionType.INCOME, location_id: loc2.id, category: "Deposit" },
    { amount: 7500000, description: "Deposit B2 - Dewi Lestari", date: new Date("2026-04-28"), type: TransactionType.INCOME, location_id: loc2.id, category: "Deposit" },
    { amount: 4500000, description: "Deposit A2 - Fajar Nugroho", date: new Date("2026-03-28"), type: TransactionType.INCOME, location_id: loc2.id, category: "Deposit" },
    // === Location 2: Expenses ===
    { amount: 1800000, description: "Biaya listrik - Feb 2026", date: new Date("2026-02-25"), type: TransactionType.EXPENSE, location_id: loc2.id, category: "Utilitas" },
    { amount: 1900000, description: "Biaya listrik - Mar 2026", date: new Date("2026-03-25"), type: TransactionType.EXPENSE, location_id: loc2.id, category: "Utilitas" },
    { amount: 1850000, description: "Biaya listrik - Apr 2026", date: new Date("2026-04-25"), type: TransactionType.EXPENSE, location_id: loc2.id, category: "Utilitas" },
    { amount: 1800000, description: "Biaya listrik - Mei 2026", date: new Date("2026-05-25"), type: TransactionType.EXPENSE, location_id: loc2.id, category: "Utilitas" },
    { amount: 800000, description: "Biaya air - Mar 2026", date: new Date("2026-03-20"), type: TransactionType.EXPENSE, location_id: loc2.id, category: "Utilitas" },
    { amount: 850000, description: "Biaya air - Apr 2026", date: new Date("2026-04-20"), type: TransactionType.EXPENSE, location_id: loc2.id, category: "Utilitas" },
    { amount: 10000000, description: "Gaji staff - Mei 2026", date: new Date("2026-05-30"), type: TransactionType.EXPENSE, location_id: loc2.id, category: "Gaji" },
    { amount: 2000000, description: "Perbaikan pagar halaman", date: new Date("2026-04-18"), type: TransactionType.EXPENSE, location_id: loc2.id, category: "Maintenance" },
  ];

  await prisma.transaction.createMany({ data: txData });

  // ═══════════════════════════════════════════════════════
  // Invoice Sequences (to track numbering state)
  // ═══════════════════════════════════════════════════════

  const seqData: { location_id: number; year: number; month: number; last_number: number }[] = [];
  for (const [key, count] of Object.entries(invoiceCounter)) {
    const [_code, yearMonth] = key.split("-", 2);
    const locCode = key.substring(0, 3);
    const locId = locCode === "SDK" ? loc1.id : loc2.id;
    const [yearStr, monthStr] = (yearMonth || key.substring(4)).split("-");
    // Parse from the full key
    const parts = key.split("/");
    // key format: "SDK-2026-01" or "KMG-2026-01"
    const segs = key.split("-");
    seqData.push({
      location_id: locId,
      year: parseInt(segs[1]),
      month: parseInt(segs[2]),
      last_number: count,
    });
  }

  for (const seq of seqData) {
    await prisma.invoiceSequence.upsert({
      where: {
        location_id_year_month: {
          location_id: seq.location_id,
          year: seq.year,
          month: seq.month,
        },
      },
      update: { last_number: seq.last_number },
      create: seq,
    });
  }

  // ═══════════════════════════════════════════════════════
  // Calendar Events (various types, recurring, all-day)
  // ═══════════════════════════════════════════════════════

  await prisma.event.createMany({
    data: [
      {
        title: "Maintenance AC - Kamar 302",
        description: "Jadwal perbaikan AC unit luar",
        start: new Date("2026-06-12T09:00:00"),
        end: new Date("2026-06-12T12:00:00"),
        backgroundColor: "#f97316",
        textColor: "#ffffff",
      },
      {
        title: "Inspeksi Kebakaran Tahunan",
        description: "Inspeksi alat pemadam dan jalur evakuasi",
        start: new Date("2026-06-20T08:00:00"),
        end: new Date("2026-06-20T17:00:00"),
        allDay: true,
        backgroundColor: "#ef4444",
        textColor: "#ffffff",
      },
      {
        title: "Fumigasi Gedung",
        description: "Pest control rutin bulanan",
        start: new Date("2026-06-15T14:00:00"),
        end: new Date("2026-06-15T16:00:00"),
        recurring: true,
        backgroundColor: "#8b5cf6",
        textColor: "#ffffff",
        extendedProps: { frequency: "monthly", location: "Sudirman" },
      },
      {
        title: "Meeting Penghuni",
        description: "Rapat bulanan dengan penghuni",
        start: new Date("2026-06-25T19:00:00"),
        end: new Date("2026-06-25T20:30:00"),
        recurring: true,
        backgroundColor: "#0ea5e9",
        textColor: "#ffffff",
        extendedProps: { frequency: "monthly", location: "All" },
      },
      {
        title: "Kontrak Habis - Kamar 102 (Diana Putri)",
        description: "Booking berakhir 31 Agustus 2026, follow up perpanjangan",
        start: new Date("2026-08-31T00:00:00"),
        allDay: true,
        backgroundColor: "#eab308",
        textColor: "#000000",
      },
      {
        title: "Kontrak Habis - A1 (Lisa Anggraini)",
        description: "Booking berakhir 31 Juli 2026",
        start: new Date("2026-07-31T00:00:00"),
        allDay: true,
        backgroundColor: "#eab308",
        textColor: "#000000",
        extendedProps: { location: "Kemang" },
      },
      {
        title: "Check-in Tenant Baru - Kamar 104",
        description: "Citra Dewantara check-in 1 Juli 2026",
        start: new Date("2026-07-01T10:00:00"),
        end: new Date("2026-07-01T12:00:00"),
        backgroundColor: "#22c55e",
        textColor: "#ffffff",
      },
      {
        title: "Service Lift",
        description: "Perawatan rutin lift gedung",
        start: new Date("2026-06-18T08:00:00"),
        end: new Date("2026-06-18T11:00:00"),
        backgroundColor: "#64748b",
        textColor: "#ffffff",
      },
    ],
  });

  // ═══════════════════════════════════════════════════════
  // Rules (house rules)
  // ═══════════════════════════════════════════════════════

  await prisma.rule.createMany({
    data: [
      { description: "Jam tenang pukul 22:00 - 06:00 WIB" },
      { description: "Dilarang memelihara hewan peliharaan tanpa izin manajemen" },
      { description: "Tamu menginap maksimal 7 hari, wajib lapor ke resepsionis" },
      { description: "Parkir hanya di area yang telah ditentukan" },
      { description: "Dilarang merokok di dalam kamar dan area bersama" },
      { description: "Kerusakan properti akibat kelalaian penghuni menjadi tanggung jawab penghuni" },
      { description: "Pembayaran sewa dilakukan sebelum tanggal jatuh tempo setiap bulan" },
      { description: "Perubahan penghuni wajib melalui proses administrasi resmi" },
    ],
  });

  // ═══════════════════════════════════════════════════════
  // Reports (historical reports)
  // ═══════════════════════════════════════════════════════

  await prisma.report.createMany({
    data: [
      {
        type: "MONTHLY_FINANCIAL",
        generated_at: new Date("2026-05-01"),
        content: JSON.stringify({
          month: "April 2026",
          total_income: 48500000,
          total_expense: 22750000,
          net: 25750000,
          occupancy_rate: 0.78,
        }),
      },
      {
        type: "MONTHLY_FINANCIAL",
        generated_at: new Date("2026-06-01"),
        content: JSON.stringify({
          month: "Mei 2026",
          total_income: 39850000,
          total_expense: 37150000,
          net: 2700000,
          occupancy_rate: 0.8,
        }),
      },
      {
        type: "OCCUPANCY",
        generated_at: new Date("2026-06-01"),
        content: JSON.stringify({
          total_rooms: 15,
          occupied: 11,
          available: 3,
          maintenance: 1,
          occupancy_rate: 0.73,
          by_location: {
            sudirman: { total: 9, occupied: 6 },
            kemang: { total: 6, occupied: 5 },
          },
        }),
      },
    ],
  });

  // ═══════════════════════════════════════════════════════
  // Email Templates
  // ═══════════════════════════════════════════════════════

  await prisma.emailTemplate.createMany({
    data: [
      {
        template_key: "invoice_reminder",
        subject: "Pengingat Pembayaran - {{month}}",
        body_html: `<h2>Yth. {{tenant_name}},</h2>
<p>Ini adalah pengingat bahwa tagihan Anda untuk bulan <strong>{{month}}</strong> sebesar <strong>Rp {{amount}}</strong> akan jatuh tempo pada <strong>{{due_date}}</strong>.</p>
<p>Mohon segera lakukan pembayaran. Terima kasih.</p>
<p>Salam,<br>{{company_name}}</p>`,
        is_enabled: true,
      },
      {
        template_key: "payment_confirmation",
        subject: "Konfirmasi Pembayaran - {{invoice_number}}",
        body_html: `<h2>Yth. {{tenant_name}},</h2>
<p>Pembayaran Anda sebesar <strong>Rp {{amount}}</strong> untuk invoice <strong>{{invoice_number}}</strong> telah kami terima dan diverifikasi.</p>
<p>Terima kasih atas pembayaran tepat waktu Anda.</p>
<p>Salam,<br>{{company_name}}</p>`,
        is_enabled: true,
      },
      {
        template_key: "welcome_tenant",
        subject: "Selamat Datang di {{company_name}}!",
        body_html: `<h2>Yth. {{tenant_name}},</h2>
<p>Selamat datang di <strong>{{location_name}}</strong>! Kami senang menyambut Anda sebagai penghuni baru di Kamar <strong>{{room_number}}</strong>.</p>
<p>Tanggal check-in: <strong>{{check_in_date}}</strong></p>
<p>Jika Anda memiliki pertanyaan, jangan ragu untuk menghubungi kami.</p>
<p>Salam hangat,<br>{{company_name}}</p>`,
        is_enabled: true,
      },
      {
        template_key: "contract_expiry",
        subject: "Kontrak Akan Berakhir - {{room_number}}",
        body_html: `<h2>Yth. {{tenant_name}},</h2>
<p>Kontrak Anda di Kamar <strong>{{room_number}}</strong> akan berakhir pada <strong>{{end_date}}</strong>.</p>
<p>Jika Anda ingin memperpanjang, silakan hubungi kami sebelum tanggal tersebut.</p>
<p>Salam,<br>{{company_name}}</p>`,
        is_enabled: true,
      },
      {
        template_key: "late_payment_notice",
        subject: "Pemberitahuan Keterlambatan Pembayaran",
        body_html: `<h2>Yth. {{tenant_name}},</h2>
<p>Kami ingin menginformasikan bahwa pembayaran Anda untuk bulan <strong>{{month}}</strong> telah <strong>melewati jatuh tempo</strong>.</p>
<p>Denda keterlambatan sebesar <strong>Rp {{late_fee}}</strong> telah dikenakan.</p>
<p>Total yang harus dibayar: <strong>Rp {{total_amount}}</strong></p>
<p>Mohon segera lakukan pembayaran.</p>
<p>Salam,<br>{{company_name}}</p>`,
        is_enabled: true,
      },
      {
        template_key: "password_reset",
        subject: "Reset Password - {{company_name}}",
        body_html: `<h2>Reset Password</h2>
<p>Anda menerima email ini karena ada permintaan reset password untuk akun Anda.</p>
<p>Klik link berikut untuk mereset password: <a href="{{reset_link}}">Reset Password</a></p>
<p>Link ini berlaku selama 1 jam.</p>
<p>Jika Anda tidak meminta reset password, abaikan email ini.</p>`,
        is_enabled: true,
      },
    ],
    skipDuplicates: true,
  });

  // ═══════════════════════════════════════════════════════
  // Email Logs (sample sent emails)
  // ═══════════════════════════════════════════════════════

  await prisma.emailLogs.createMany({
    data: [
      {
        from: "noreply@micasasuites.com",
        to: "ahmad.wijaya@gmail.com",
        subject: "Pengingat Pembayaran - Juni 2026",
        status: "SENT",
        payload: JSON.stringify({ template: "invoice_reminder", tenant: "Ahmad Wijaya", amount: 4250000 }),
      },
      {
        from: "noreply@micasasuites.com",
        to: "diana.putri@yahoo.com",
        subject: "Pengingat Pembayaran - Mei 2026",
        status: "SENT",
        payload: JSON.stringify({ template: "invoice_reminder", tenant: "Diana Putri", amount: 4500000 }),
      },
      {
        from: "noreply@micasasuites.com",
        to: "reza.f@outlook.com",
        subject: "Konfirmasi Pembayaran - INV/SDK/2026-04/0003",
        status: "SENT",
        payload: JSON.stringify({ template: "payment_confirmation", tenant: "Reza Firmansyah", amount: 6000000 }),
      },
      {
        from: "noreply@micasasuites.com",
        to: "kevin.h@gmail.com",
        subject: "Selamat Datang di Mi Casa Suites!",
        status: "SENT",
        payload: JSON.stringify({ template: "welcome_tenant", tenant: "Kevin Hartanto", room: "301" }),
      },
      {
        from: "noreply@micasasuites.com",
        to: "maya.sari@gmail.com",
        subject: "Pemberitahuan Keterlambatan Pembayaran",
        status: "SENT",
        payload: JSON.stringify({ template: "late_payment_notice", tenant: "Maya Sari", month: "April 2026" }),
      },
      {
        from: "noreply@micasasuites.com",
        to: "invalid@nonexistent.xyz",
        subject: "Pengingat Pembayaran - April 2026",
        status: "FAILED",
        payload: JSON.stringify({ template: "invoice_reminder", error: "Mailbox not found" }),
      },
    ],
  });

  // ═══════════════════════════════════════════════════════
  // Logs (audit trail)
  // ═══════════════════════════════════════════════════════

  await prisma.log.createMany({
    data: [
      { site_user_id: admin.id, action: "LOGIN", timestamp: new Date("2026-06-15T08:00:00") },
      { site_user_id: admin.id, action: "CREATE_BOOKING id=10 (Kamar 104, Citra Dewantara)", timestamp: new Date("2026-06-14T10:30:00") },
      { site_user_id: manager.id, action: "LOGIN", timestamp: new Date("2026-06-14T09:00:00") },
      { site_user_id: manager.id, action: "VERIFY_PAYMENT id=6 (Reza Firmansyah, Rp6.000.000)", timestamp: new Date("2026-06-01T11:15:00") },
      { site_user_id: manager.id, action: "REJECT_PAYMENT id=7 (Maya Sari, Rp6.500.000)", timestamp: new Date("2026-04-12T14:20:00") },
      { site_user_id: staffUser.id, action: "LOGIN", timestamp: new Date("2026-06-15T07:45:00") },
      { site_user_id: staffUser.id, action: "CREATE_METER_READING booking=1 type=electricity value=1950", timestamp: new Date("2026-06-01T09:00:00") },
      { site_user_id: staffUser.id, action: "CREATE_METER_READING booking=1 type=water value=75", timestamp: new Date("2026-06-01T09:05:00") },
      { site_user_id: staffUser.id, action: "CHECK_IN booking=9 tenant=Fajar Nugroho", timestamp: new Date("2026-04-01T10:00:00") },
      { site_user_id: admin.id, action: "UPDATE_SETTING key=MONTHLY_INVOICE_EMAIL_REMINDER_ENABLED value=true", timestamp: new Date("2026-05-01T12:00:00") },
      { site_user_id: admin.id, action: "CREATE_USER email=newstaff@micasasuites.com role=Staff", timestamp: new Date("2026-06-10T16:00:00") },
      { site_user_id: admin.id, action: "CANCEL_BOOKING id=12 (Kamar 203, Citra Dewantara)", timestamp: new Date("2026-01-10T11:00:00") },
      { site_user_id: manager.id, action: "CREATE_PENALTY booking=7 amount=1500000 (kerusakan furniture)", timestamp: new Date("2026-05-15T13:45:00") },
      { site_user_id: admin.id, action: "REFUND_DEPOSIT booking=11 amount=4000000", timestamp: new Date("2025-12-05T14:00:00") },
      { site_user_id: admin.id, action: "PARTIAL_REFUND_DEPOSIT booking=12 amount=5000000", timestamp: new Date("2026-01-15T15:30:00") },
    ],
  });

  // ═══════════════════════════════════════════════════════
  // Verification Token (sample for password reset flow)
  // ═══════════════════════════════════════════════════════

  await prisma.verificationToken.create({
    data: {
      identifier: "newstaff@micasasuites.com",
      token: "sample-verification-token-abc123",
      expires: new Date("2026-06-16T08:00:00"),
    },
  });

  // ═══════════════════════════════════════════════════════
  // Done!
  // ═══════════════════════════════════════════════════════

  console.log("═══════════════════════════════════════════════════════");
  console.log("  Mock data seeded successfully!");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
  console.log("  Reference Data:");
  console.log("  - 4 booking statuses, 3 payment statuses, 3 room statuses");
  console.log("  - 4 roles, 29 permissions with full RBAC grants");
  console.log("  - 5 app settings");
  console.log("");
  console.log("  Users & Access:");
  console.log("  - 5 users (Admin, Manager, Staff, Viewer, New Staff w/ reset)");
  console.log("  - 7 user↔location assignments");
  console.log("");
  console.log("  Property:");
  console.log("  - 2 locations (Sudirman + Kemang)");
  console.log("  - 3 room types, 3 durations, 15 pricing combos");
  console.log("  - 15 rooms across both locations");
  console.log("");
  console.log("  Tenants & Bookings:");
  console.log("  - 10 tenants (2 with second residents)");
  console.log("  - 12 bookings (9 active, 1 pending, 1 completed, 1 cancelled)");
  console.log("  - 8 booking add-ons (fixed + rolling)");
  console.log("  - 12 deposits (all statuses)");
  console.log("  - 2 billing policies (location-level) + 1 booking-level override");
  console.log("");
  console.log("  Billing & Payments:");
  console.log("  - Monthly bills generated through June 2026 with invoice numbers");
  console.log("  - Add-on line items, manual charges");
  console.log("  - Payments: verified, pending, rejected; all methods (cash/transfer/ewallet)");
  console.log("  - Multi-bill bulk payments and manual allocation");
  console.log("  - Invoice sequences synced");
  console.log("");
  console.log("  Utilities & Metering:");
  console.log("  - 23 meter readings (electricity + water, 3 bookings)");
  console.log("");
  console.log("  Guests & Events:");
  console.log("  - 4 guests, 5 guest stays");
  console.log("  - 13 check-in/out logs");
  console.log("  - 8 calendar events (one-off, recurring, all-day)");
  console.log("");
  console.log("  Penalties & Rules:");
  console.log("  - 4 penalties (late payment, damage, cancellation)");
  console.log("  - 8 house rules");
  console.log("");
  console.log("  Financial:");
  console.log(`  - ${txData.length} transactions (income, expense, credit)"`);
  console.log("  - 3 historical reports");
  console.log("");
  console.log("  Communication:");
  console.log("  - 6 email templates");
  console.log("  - 6 email logs (5 sent, 1 failed)");
  console.log("  - 15 audit logs");
  console.log("  - 1 verification token");
  console.log("");
  console.log("  Logins:");
  console.log("  - admin@micasasuites.com / admin123 (Admin, all locations)");
  console.log("  - manager@micasasuites.com / staff123 (Manager, all locations)");
  console.log("  - staff@micasasuites.com / staff123 (Staff, Sudirman only)");
  console.log("  - viewer@micasasuites.com / staff123 (Viewer, Sudirman only)");
  console.log("  - newstaff@micasasuites.com / staff123 (Staff, Kemang, needs password reset)");
  console.log("═══════════════════════════════════════════════════════");
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
