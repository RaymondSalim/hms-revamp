import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { upsertBookingAction } from "@/app/(internal)/(dashboard_layout)/bookings/booking-action";

describe("Room Overlap Detection (BL-015/016)", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  async function createBaseData() {
    // seedTestData() already creates location(id=1), roomStatuses(1-3),
    // rooms(id=1,2), durations(id=1-4), bookingStatuses(id=1-4)
    // We create additional rooms with unique names to avoid conflicts
    const location = await testPrisma.location.create({
      data: { name: "Overlap Test Location", address: "Test Address" },
    });

    const roomType = await testPrisma.roomType.upsert({
      where: { type: "Standard" },
      update: {},
      create: { type: "Standard", description: "Standard Room" },
    });

    const room1 = await testPrisma.room.create({
      data: {
        room_number: `OVR1-${Date.now()}`,
        room_type_id: roomType.id,
        status_id: 1,
        location_id: location.id,
      },
    });

    const room2 = await testPrisma.room.create({
      data: {
        room_number: `OVR2-${Date.now()}`,
        room_type_id: roomType.id,
        status_id: 1,
        location_id: location.id,
      },
    });

    const tenant = await testPrisma.tenant.create({
      data: {
        name: "Test Tenant",
        id_number: `OVR-${Date.now()}`,
        email: "overlap-test@example.com",
      },
    });

    // Use seeded duration id=3 (6 Bulan, month_count=6) and bookingStatus id=2 (ACTIVE)
    return {
      location,
      room1,
      room2,
      tenant,
      durationId: 3,
      statusId: 2,
    };
  }

  describe("Fixed booking overlap", () => {
    it("should reject overlapping bookings for the same room", async () => {
      const { room1, tenant, durationId, statusId } = await createBaseData();

      // Create first booking: Jan 1 - Jun 30
      const firstResult = await upsertBookingAction({
        room_id: room1.id,
        start_date: new Date("2025-01-01"),
        duration_id: durationId,
        fee: 3000000,
        tenant_id: tenant.id,
        is_rolling: false,
        status_id: statusId,
      });

      expect(firstResult.success).toBe(true);

      // Attempt second booking overlapping: Mar 1 - Aug 31
      const secondResult = await upsertBookingAction({
        room_id: room1.id,
        start_date: new Date("2025-03-01"),
        duration_id: durationId,
        fee: 3000000,
        tenant_id: tenant.id,
        is_rolling: false,
        status_id: statusId,
      });

      expect(secondResult.success).toBe(false);
      expect(secondResult.error).toContain("tumpang tindih");
    });

    it("should allow booking after first one ends", async () => {
      const { room1, tenant, durationId, statusId } = await createBaseData();

      // First booking: Jan 1 - Jun 30
      const firstResult = await upsertBookingAction({
        room_id: room1.id,
        start_date: new Date("2025-01-01"),
        duration_id: durationId,
        fee: 3000000,
        tenant_id: tenant.id,
        is_rolling: false,
        status_id: statusId,
      });

      expect(firstResult.success).toBe(true);

      // Second booking starting Jul 1 (after first ends)
      const secondResult = await upsertBookingAction({
        room_id: room1.id,
        start_date: new Date("2025-07-01"),
        duration_id: durationId,
        fee: 3000000,
        tenant_id: tenant.id,
        is_rolling: false,
        status_id: statusId,
      });

      expect(secondResult.success).toBe(true);
    });

    it("should allow booking for a different room at the same time", async () => {
      const { room1, room2, tenant, durationId, statusId } =
        await createBaseData();

      // First booking on room1: Jan 1 - Jun 30
      const firstResult = await upsertBookingAction({
        room_id: room1.id,
        start_date: new Date("2025-01-01"),
        duration_id: durationId,
        fee: 3000000,
        tenant_id: tenant.id,
        is_rolling: false,
        status_id: statusId,
      });

      expect(firstResult.success).toBe(true);

      // Second booking on room2 at same time
      const secondResult = await upsertBookingAction({
        room_id: room2.id,
        start_date: new Date("2025-01-01"),
        duration_id: durationId,
        fee: 3000000,
        tenant_id: tenant.id,
        is_rolling: false,
        status_id: statusId,
      });

      expect(secondResult.success).toBe(true);
    });
  });

  describe("Rolling booking overlap (BL-015)", () => {
    it("should reject second rolling booking for same room", async () => {
      const { room1, tenant, statusId } = await createBaseData();

      // First rolling booking
      const firstResult = await upsertBookingAction({
        room_id: room1.id,
        start_date: new Date("2025-01-01"),
        duration_id: null,
        fee: 3000000,
        tenant_id: tenant.id,
        is_rolling: true,
        status_id: statusId,
      });

      expect(firstResult.success).toBe(true);

      // Second rolling booking for same room
      const secondResult = await upsertBookingAction({
        room_id: room1.id,
        start_date: new Date("2025-03-01"),
        duration_id: null,
        fee: 3000000,
        tenant_id: tenant.id,
        is_rolling: true,
        status_id: statusId,
      });

      expect(secondResult.success).toBe(false);
      expect(secondResult.error).toContain("bergulir");
    });

    it("should allow rolling booking on different room", async () => {
      const { room1, room2, tenant, statusId } = await createBaseData();

      const firstResult = await upsertBookingAction({
        room_id: room1.id,
        start_date: new Date("2025-01-01"),
        duration_id: null,
        fee: 3000000,
        tenant_id: tenant.id,
        is_rolling: true,
        status_id: statusId,
      });

      expect(firstResult.success).toBe(true);

      const secondResult = await upsertBookingAction({
        room_id: room2.id,
        start_date: new Date("2025-01-01"),
        duration_id: null,
        fee: 3000000,
        tenant_id: tenant.id,
        is_rolling: true,
        status_id: statusId,
      });

      expect(secondResult.success).toBe(true);
    });
  });
});
