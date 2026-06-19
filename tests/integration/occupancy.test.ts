import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { getOccupancyRate } from "@/app/_db/dashboard";

const PENDING = 1;
const ACTIVE = 2;
const CANCELLED = 4;

// Fixed reference date so occupancy is deterministic. start_date/end_date are
// @db.Date (midnight UTC); the suite runs with TZ=UTC.
const ASOF = new Date("2025-06-15T00:00:00.000Z");

describe("getOccupancyRate", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
    // seedTestData creates rooms 1 and 2 in location 1. Add a third so we can
    // exercise the 1-of-3 (33.3%) case.
    await testPrisma.room.create({
      data: {
        id: 3,
        room_number: "103",
        room_type_id: 1,
        status_id: 1,
        location_id: 1,
      },
    });
  });

  async function createTenant(name: string) {
    return testPrisma.tenant.create({
      data: { name, id_number: `id-${name}-${Date.now()}-${Math.random()}` },
    });
  }

  async function createBooking(params: {
    roomId: number;
    statusId: number;
    startDate: Date;
    endDate: Date | null;
  }) {
    const tenant = await createTenant(`T${params.roomId}-${params.statusId}`);
    return testPrisma.booking.create({
      data: {
        room_id: params.roomId,
        start_date: params.startDate,
        end_date: params.endDate,
        fee: 1000000,
        tenant_id: tenant.id,
        is_rolling: false,
        status_id: params.statusId,
      },
    });
  }

  it("returns 0 occupancy when there are no bookings", async () => {
    const result = await getOccupancyRate(1, ASOF);
    expect(result).toEqual({ totalRooms: 3, occupiedRooms: 0, rate: 0 });
  });

  it("counts an ACTIVE booking spanning asOf as occupied", async () => {
    await createBooking({
      roomId: 1,
      statusId: ACTIVE,
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: new Date("2025-07-01T00:00:00.000Z"),
    });

    const result = await getOccupancyRate(1, ASOF);
    // 1 of 3 rooms occupied -> 33.3%
    expect(result.totalRooms).toBe(3);
    expect(result.occupiedRooms).toBe(1);
    expect(result.rate).toBe(33.3);
  });

  it("counts an open-ended ACTIVE booking (null end_date) as occupied", async () => {
    await createBooking({
      roomId: 1,
      statusId: ACTIVE,
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: null,
    });

    const result = await getOccupancyRate(1, ASOF);
    expect(result.occupiedRooms).toBe(1);
    expect(result.rate).toBe(33.3);
  });

  it("computes the rate across multiple occupied rooms", async () => {
    await createBooking({
      roomId: 1,
      statusId: ACTIVE,
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: null,
    });
    await createBooking({
      roomId: 2,
      statusId: ACTIVE,
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: null,
    });

    const result = await getOccupancyRate(1, ASOF);
    // 2 of 3 rooms -> 66.7%
    expect(result.occupiedRooms).toBe(2);
    expect(result.rate).toBe(66.7);
  });

  it("counts a room only once even with multiple matching bookings", async () => {
    await createBooking({
      roomId: 1,
      statusId: ACTIVE,
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: null,
    });
    await createBooking({
      roomId: 1,
      statusId: ACTIVE,
      startDate: new Date("2025-05-01T00:00:00.000Z"),
      endDate: null,
    });

    const result = await getOccupancyRate(1, ASOF);
    expect(result.occupiedRooms).toBe(1);
  });

  it("does NOT count a CANCELLED booking", async () => {
    await createBooking({
      roomId: 1,
      statusId: CANCELLED,
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: null,
    });

    const result = await getOccupancyRate(1, ASOF);
    expect(result.occupiedRooms).toBe(0);
    expect(result.rate).toBe(0);
  });

  it("does NOT count a PENDING booking", async () => {
    await createBooking({
      roomId: 1,
      statusId: PENDING,
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: null,
    });

    const result = await getOccupancyRate(1, ASOF);
    expect(result.occupiedRooms).toBe(0);
  });

  it("does NOT count a booking whose end_date is before asOf", async () => {
    await createBooking({
      roomId: 1,
      statusId: ACTIVE,
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-05-31T00:00:00.000Z"),
    });

    const result = await getOccupancyRate(1, ASOF);
    expect(result.occupiedRooms).toBe(0);
  });

  it("does NOT count a future booking (start_date after asOf)", async () => {
    await createBooking({
      roomId: 1,
      statusId: ACTIVE,
      startDate: new Date("2025-07-01T00:00:00.000Z"),
      endDate: null,
    });

    const result = await getOccupancyRate(1, ASOF);
    expect(result.occupiedRooms).toBe(0);
  });

  it("returns 0 rate (not NaN) when the location has no rooms", async () => {
    const emptyLocation = await testPrisma.location.create({
      data: { name: "Empty", address: "Nowhere" },
    });

    const result = await getOccupancyRate(emptyLocation.id, ASOF);
    expect(result).toEqual({ totalRooms: 0, occupiedRooms: 0, rate: 0 });
  });
});
