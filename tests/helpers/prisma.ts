import { PrismaClient } from "@prisma/client";

const DATABASE_URL = "postgresql://test:test@localhost:5433/hms_test";

export const testPrisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } },
});

export async function cleanDatabase() {
  // Delete in proper order to avoid FK violations
  await testPrisma.$executeRawUnsafe(`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;
  `);
}

export async function seedTestData() {
  // Create base data needed by most tests
  await testPrisma.bookingStatus.createMany({
    data: [
      { id: 1, status: "PENDING" },
      { id: 2, status: "ACTIVE" },
      { id: 3, status: "COMPLETED" },
      { id: 4, status: "CANCELLED" },
    ],
    skipDuplicates: true,
  });

  await testPrisma.roomStatus.createMany({
    data: [
      { id: 1, status: "Available" },
      { id: 2, status: "Occupied" },
      { id: 3, status: "Maintenance" },
    ],
    skipDuplicates: true,
  });

  await testPrisma.paymentStatus.createMany({
    data: [
      { id: 1, status: "PENDING" },
      { id: 2, status: "VERIFIED" },
      { id: 3, status: "REJECTED" },
    ],
    skipDuplicates: true,
  });

  await testPrisma.duration.createMany({
    data: [
      { id: 1, duration: "1 Bulan", month_count: 1 },
      { id: 2, duration: "3 Bulan", month_count: 3 },
      { id: 3, duration: "6 Bulan", month_count: 6 },
      { id: 4, duration: "12 Bulan", month_count: 12 },
    ],
    skipDuplicates: true,
  });

  const location = await testPrisma.location.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: "Test Location", address: "Jl. Test 123" },
  });

  const roomType = await testPrisma.roomType.upsert({
    where: { type: "Standard" },
    update: {},
    create: { id: 1, type: "Standard", description: "Standard Room" },
  });

  await testPrisma.room.upsert({
    where: { room_number_location_id: { room_number: "101", location_id: 1 } },
    update: {},
    create: { id: 1, room_number: "101", room_type_id: 1, status_id: 1, location_id: 1 },
  });

  await testPrisma.room.upsert({
    where: { room_number_location_id: { room_number: "102", location_id: 1 } },
    update: {},
    create: { id: 2, room_number: "102", room_type_id: 1, status_id: 1, location_id: 1 },
  });

  // Advance sequences past the explicit IDs we inserted so that
  // subsequent create() calls without explicit IDs don't collide
  const tables = [
    "locations",
    "rooms",
    "roomtypes",
    "roomstatuses",
    "bookingstatuses",
    "paymentstatuses",
    "durations",
  ];
  for (const table of tables) {
    await testPrisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT COALESCE(MAX(id), 0) FROM "${table}"))`
    );
  }

  return { location, roomType };
}
