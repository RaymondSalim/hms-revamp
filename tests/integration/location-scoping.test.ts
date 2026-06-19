import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import {
  setUserLocations,
  getUserLocationIds,
} from "@/app/_db/site-users";
import { getBookingById } from "@/app/_db/bookings";

describe("Location assignment", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  async function createUser() {
    return testPrisma.siteUser.create({
      data: {
        name: "Scoped User",
        email: `u-${Date.now()}@test.com`,
        password: "x",
      },
    });
  }

  async function createLocation(name: string) {
    return testPrisma.location.create({ data: { name, address: name } });
  }

  it("starts global (no assignments)", async () => {
    const user = await createUser();
    expect(await getUserLocationIds(user.id)).toEqual([]);
  });

  it("setUserLocations replaces the assignment set", async () => {
    const user = await createUser();
    const a = await createLocation("A");
    const b = await createLocation("B");
    const c = await createLocation("C");

    await setUserLocations(user.id, [a.id, b.id]);
    expect((await getUserLocationIds(user.id)).sort()).toEqual([a.id, b.id].sort());

    await setUserLocations(user.id, [c.id]);
    expect(await getUserLocationIds(user.id)).toEqual([c.id]);

    await setUserLocations(user.id, []);
    expect(await getUserLocationIds(user.id)).toEqual([]);
  });
});

describe("By-id scope guard", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it("returns null when the booking's location is out of scope", async () => {
    const locA = await testPrisma.location.create({ data: { name: "A", address: "A" } });
    const locB = await testPrisma.location.create({ data: { name: "B", address: "B" } });
    const rt = await testPrisma.roomType.create({ data: { type: `T-${Date.now()}` } });
    await testPrisma.roomStatus.upsert({ where: { id: 1 }, update: {}, create: { id: 1, status: "AVAILABLE" } });
    const room = await testPrisma.room.create({
      data: { room_number: `R-${Date.now()}`, room_type_id: rt.id, status_id: 1, location_id: locA.id },
    });
    const tenant = await testPrisma.tenant.create({
      data: { name: "T", id_number: "1", email: "t@test.com" },
    });
    const booking = await testPrisma.booking.create({
      data: { room_id: room.id, start_date: new Date("2025-01-01"), end_date: new Date("2025-01-31"), fee: 1000000, tenant_id: tenant.id, is_rolling: false },
    });

    expect(await getBookingById(booking.id, [locA.id])).not.toBeNull();
    expect(await getBookingById(booking.id, [locB.id])).toBeNull();
    expect(await getBookingById(booking.id, null)).not.toBeNull();
  });
});
