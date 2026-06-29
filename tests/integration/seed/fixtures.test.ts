import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { makeRng } from "../../../prisma/seed/rng";
import { truncateAll } from "../../../prisma/seed/reset";
import { seedReference } from "../../../prisma/seed/reference";
import { seedLocationsRoomsTypes } from "../../../prisma/seed/generate/locations-rooms";
import { seedAnchorFixtures } from "../../../prisma/seed/fixtures";

const prisma = new PrismaClient();

describe("anchor fixtures", () => {
  beforeEach(async () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T00:00:00Z");
    await truncateAll(prisma);
    await seedReference(prisma);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("creates >=2 anchors per scenario and the named E2E anchors", async () => {
    const ctx = await seedLocationsRoomsTypes(prisma, makeRng(1));
    const specs = await seedAnchorFixtures(prisma, ctx);

    // >=2 per scenario for the key scenarios
    for (const s of ["active", "completed", "future", "pending", "cancelled", "rolling", "overdue", "pending_payment", "rejected", "partial"]) {
      const count = specs.filter((x) => x.scenario === s).length;
      expect(count, `scenario ${s}`).toBeGreaterThanOrEqual(2);
    }

    // Named E2E anchors exist
    const ahmad = await prisma.tenant.findFirst({ where: { name: "Ahmad Wijaya" } });
    expect(ahmad).toBeTruthy();
    const a3 = await prisma.room.findFirst({ where: { room_number: "A3", location_id: 2 } });
    expect(a3).toBeTruthy();

    // A3 must be FREE (no bookings) for create-booking.spec.ts
    const a3BookingCount = await prisma.booking.count({ where: { room_id: a3!.id } });
    expect(a3BookingCount, "room A3 should have no bookings").toBe(0);

    // both locations represented among anchor bookings
    expect(new Set(specs.map((s) => s.locationId))).toEqual(new Set([1, 2]));

    // Every spec has a non-zero bookingDbId
    for (const spec of specs) {
      expect(spec.bookingDbId, `${spec.scenario} booking has bookingDbId`).toBeGreaterThan(0);
    }
  });
});
