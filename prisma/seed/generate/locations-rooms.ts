import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { Rng } from "../rng";

export interface SeedLocationsResult {
  locationIds: number[];
  roomIds: number[];
  roomTypeIds: number[];
  durationIds: number[];
}

/**
 * Create the 2 fixed locations (Sudirman id 1, Kemang id 2), 5 login users,
 * user-location assignments, per-location billing policies, room types,
 * durations, pricing matrix, and ~300 generated rooms.
 */
export async function seedLocationsRoomsTypes(
  prisma: PrismaClient,
  rng: Rng
): Promise<SeedLocationsResult> {
  // ═══════════════════════════════════════════════════════════════════════
  // Locations (fixed ids for E2E contract)
  // ═══════════════════════════════════════════════════════════════════════

  const loc1 = await prisma.location.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: "Mi Casa Sudirman",
      address: "Jl. Jend. Sudirman No. 45, Jakarta Selatan",
      code: "SDK",
    },
  });

  const loc2 = await prisma.location.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      name: "Mi Casa Kemang",
      address: "Jl. Kemang Raya No. 12, Jakarta Selatan",
      code: "KMG",
    },
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Login Users (5 fixed users for E2E)
  // ═══════════════════════════════════════════════════════════════════════

  const hashedPasswordAdmin = await bcrypt.hash("admin123", 10);
  const hashedPasswordStaff = await bcrypt.hash("staff123", 10);

  const admin = await prisma.siteUser.upsert({
    where: { email: "admin@micasasuites.com" },
    update: {},
    create: {
      name: "Administrator",
      email: "admin@micasasuites.com",
      password: hashedPasswordAdmin,
      role_id: 1,
    },
  });

  const manager = await prisma.siteUser.upsert({
    where: { email: "manager@micasasuites.com" },
    update: {},
    create: {
      name: "Budi Santoso",
      email: "manager@micasasuites.com",
      password: hashedPasswordStaff,
      role_id: 2,
    },
  });

  const staffUser = await prisma.siteUser.upsert({
    where: { email: "staff@micasasuites.com" },
    update: {},
    create: {
      name: "Siti Rahayu",
      email: "staff@micasasuites.com",
      password: hashedPasswordStaff,
      role_id: 3,
    },
  });

  const viewer = await prisma.siteUser.upsert({
    where: { email: "viewer@micasasuites.com" },
    update: {},
    create: {
      name: "Wati Susanti",
      email: "viewer@micasasuites.com",
      password: hashedPasswordStaff,
      role_id: 4,
    },
  });

  const resetUser = await prisma.siteUser.upsert({
    where: { email: "newstaff@micasasuites.com" },
    update: {},
    create: {
      name: "Rina Marlina",
      email: "newstaff@micasasuites.com",
      password: hashedPasswordStaff,
      role_id: 3,
      shouldReset: true,
    },
  });

  // ═══════════════════════════════════════════════════════════════════════
  // User ↔ Location assignments
  // ═══════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════
  // Per-location Billing Policies
  // ═══════════════════════════════════════════════════════════════════════

  await prisma.billingPolicy.create({
    data: {
      location_id: loc1.id,
      late_fee_type: "flat",
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
      late_fee_type: "percentage",
      late_fee_amount: 5.0,
      grace_period_days: 5,
      billing_cycle_day: 1,
      proration_method: "DAILY",
      tax_rate: 11.0,
      reminder_days_before: 7,
    },
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Room Types
  // ═══════════════════════════════════════════════════════════════════════

  const studio = await prisma.roomType.upsert({
    where: { type: "Studio" },
    update: {},
    create: {
      type: "Studio",
      description: "Kamar studio kompak dengan kitchenette",
    },
  });

  const oneBR = await prisma.roomType.upsert({
    where: { type: "1 Bedroom" },
    update: {},
    create: {
      type: "1 Bedroom",
      description: "Satu kamar tidur dengan ruang tamu terpisah",
    },
  });

  const twoBR = await prisma.roomType.upsert({
    where: { type: "2 Bedroom" },
    update: {},
    create: {
      type: "2 Bedroom",
      description: "Dua kamar tidur, cocok untuk keluarga",
    },
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Durations
  // ═══════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════
  // Room Type Durations (pricing matrix)
  // ═══════════════════════════════════════════════════════════════════════

  const rtdData = [
    {
      room_type_id: studio.id,
      duration_id: dur3.id,
      suggested_price: 4500000,
      location_id: loc1.id,
    },
    {
      room_type_id: studio.id,
      duration_id: dur6.id,
      suggested_price: 4000000,
      location_id: loc1.id,
    },
    {
      room_type_id: studio.id,
      duration_id: dur12.id,
      suggested_price: 3500000,
      location_id: loc1.id,
    },
    {
      room_type_id: oneBR.id,
      duration_id: dur3.id,
      suggested_price: 7000000,
      location_id: loc1.id,
    },
    {
      room_type_id: oneBR.id,
      duration_id: dur6.id,
      suggested_price: 6500000,
      location_id: loc1.id,
    },
    {
      room_type_id: oneBR.id,
      duration_id: dur12.id,
      suggested_price: 6000000,
      location_id: loc1.id,
    },
    {
      room_type_id: twoBR.id,
      duration_id: dur3.id,
      suggested_price: 10000000,
      location_id: loc1.id,
    },
    {
      room_type_id: twoBR.id,
      duration_id: dur6.id,
      suggested_price: 9000000,
      location_id: loc1.id,
    },
    {
      room_type_id: twoBR.id,
      duration_id: dur12.id,
      suggested_price: 8000000,
      location_id: loc1.id,
    },
    {
      room_type_id: studio.id,
      duration_id: dur3.id,
      suggested_price: 5000000,
      location_id: loc2.id,
    },
    {
      room_type_id: studio.id,
      duration_id: dur6.id,
      suggested_price: 4500000,
      location_id: loc2.id,
    },
    {
      room_type_id: studio.id,
      duration_id: dur12.id,
      suggested_price: 4000000,
      location_id: loc2.id,
    },
    {
      room_type_id: oneBR.id,
      duration_id: dur3.id,
      suggested_price: 8000000,
      location_id: loc2.id,
    },
    {
      room_type_id: oneBR.id,
      duration_id: dur6.id,
      suggested_price: 7500000,
      location_id: loc2.id,
    },
    {
      room_type_id: oneBR.id,
      duration_id: dur12.id,
      suggested_price: 7000000,
      location_id: loc2.id,
    },
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

  // ═══════════════════════════════════════════════════════════════════════
  // Rooms (~300 distributed across locations)
  // ═══════════════════════════════════════════════════════════════════════

  const roomTypes = [studio.id, oneBR.id, twoBR.id];
  const statusOptions: Array<[number, number]> = [
    [1, 40], // Available (40%)
    [2, 55], // Occupied (55%)
    [3, 5],  // Maintenance (5%)
  ];

  const roomsData: Array<{
    room_number: string;
    room_type_id: number;
    status_id: number;
    location_id: number;
  }> = [];

  // Location 1: ~150 rooms
  for (let floor = 1; floor <= 15; floor++) {
    for (let unit = 1; unit <= 10; unit++) {
      const roomNumber = `${floor}${String(unit).padStart(2, "0")}`;
      roomsData.push({
        room_number: roomNumber,
        room_type_id: rng.pick(roomTypes),
        status_id: rng.weighted(statusOptions),
        location_id: loc1.id,
      });
    }
  }

  // Location 2: ~150 rooms (use letter+number format)
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
  for (const letter of letters) {
    for (let num = 1; num <= 15; num++) {
      const roomNumber = `${letter}${num}`;
      roomsData.push({
        room_number: roomNumber,
        room_type_id: rng.pick(roomTypes),
        status_id: rng.weighted(statusOptions),
        location_id: loc2.id,
      });
    }
  }

  // Batch create rooms
  await prisma.room.createMany({
    data: roomsData,
    skipDuplicates: true,
  });

  // Query back to get IDs
  const createdRooms = await prisma.room.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  return {
    locationIds: [loc1.id, loc2.id],
    roomIds: createdRooms.map((r) => r.id),
    roomTypeIds: [studio.id, oneBR.id, twoBR.id],
    durationIds: [dur3.id, dur6.id, dur12.id],
  };
}
