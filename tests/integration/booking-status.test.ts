import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import { addDays, subDays } from "date-fns";

import { computeExpectedStatus } from "@/app/_lib/util/booking-status";
import { upsertBookingAction } from "@/app/(internal)/(dashboard_layout)/bookings/booking-action";
import { runBookingStatusSync } from "@/app/api/cron/booking-status-sync/route";

const PENDING = 1;
const ACTIVE = 2;
const COMPLETED = 3;
const CANCELLED = 4;

describe("computeExpectedStatus (pure)", () => {
  const today = new Date("2025-06-15");

  it("returns PENDING for a future start with no end", () => {
    expect(
      computeExpectedStatus(
        { status_id: PENDING, start_date: new Date("2025-07-01"), end_date: null },
        today
      )
    ).toBe(PENDING);
  });

  it("returns ACTIVE for a past start with no end", () => {
    expect(
      computeExpectedStatus(
        { status_id: PENDING, start_date: new Date("2025-01-01"), end_date: null },
        today
      )
    ).toBe(ACTIVE);
  });

  it("returns ACTIVE when start_date equals today", () => {
    expect(
      computeExpectedStatus(
        { status_id: PENDING, start_date: new Date("2025-06-15"), end_date: null },
        today
      )
    ).toBe(ACTIVE);
  });

  it("returns COMPLETED when end_date is before today", () => {
    expect(
      computeExpectedStatus(
        {
          status_id: ACTIVE,
          start_date: new Date("2025-01-01"),
          end_date: new Date("2025-05-31"),
        },
        today
      )
    ).toBe(COMPLETED);
  });

  it("stays ACTIVE when end_date is today or in the future", () => {
    expect(
      computeExpectedStatus(
        {
          status_id: ACTIVE,
          start_date: new Date("2025-01-01"),
          end_date: new Date("2025-06-15"),
        },
        today
      )
    ).toBe(ACTIVE);
  });

  it("never changes a CANCELLED booking (returns current)", () => {
    expect(
      computeExpectedStatus(
        { status_id: CANCELLED, start_date: new Date("2025-01-01"), end_date: null },
        today
      )
    ).toBe(CANCELLED);
  });
});

describe("Booking creation auto-status", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it("sets PENDING when start_date is in the future", async () => {
    const tenant = await testPrisma.tenant.create({
      data: { name: "Future Tenant", id_number: "f1", email: "f1@test.com" },
    });

    await upsertBookingAction({
      room_id: 1,
      start_date: addDays(new Date(), 30),
      duration_id: null,
      fee: 1000000,
      tenant_id: tenant.id,
      is_rolling: true,
      // Caller passes ACTIVE, but creation should derive PENDING from dates.
      status_id: ACTIVE,
    });

    const booking = await testPrisma.booking.findFirst({
      where: { tenant_id: tenant.id },
    });
    expect(booking?.status_id).toBe(PENDING);
  });

  it("sets ACTIVE when start_date is in the past", async () => {
    const tenant = await testPrisma.tenant.create({
      data: { name: "Past Tenant", id_number: "p1", email: "p1@test.com" },
    });

    await upsertBookingAction({
      room_id: 2,
      start_date: new Date("2025-01-01"),
      duration_id: null,
      fee: 1000000,
      tenant_id: tenant.id,
      is_rolling: true,
      status_id: ACTIVE,
    });

    const booking = await testPrisma.booking.findFirst({
      where: { tenant_id: tenant.id },
    });
    expect(booking?.status_id).toBe(ACTIVE);
  });
});

describe("runBookingStatusSync (cron)", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
    await testPrisma.setting.create({
      data: { setting_key: "BOOKING_STATUS_SYNC_ENABLED", setting_value: "true" },
    });
  });

  it("flips a stale PENDING booking with a past start to ACTIVE", async () => {
    const tenant = await testPrisma.tenant.create({
      data: { name: "Stale Tenant", id_number: "s1", email: "s1@test.com" },
    });
    const booking = await testPrisma.booking.create({
      data: {
        room_id: 1,
        start_date: subDays(new Date(), 10),
        end_date: null,
        fee: 1000000,
        tenant_id: tenant.id,
        is_rolling: true,
        status_id: PENDING,
      },
    });

    const result = await runBookingStatusSync();
    expect(result.success).toBe(true);
    expect(result.stats.updated).toBeGreaterThanOrEqual(1);

    const updated = await testPrisma.booking.findUnique({
      where: { id: booking.id },
    });
    expect(updated?.status_id).toBe(ACTIVE);
  });

  it("does not touch CANCELLED bookings", async () => {
    const tenant = await testPrisma.tenant.create({
      data: { name: "Cancelled Tenant", id_number: "c1", email: "c1@test.com" },
    });
    const booking = await testPrisma.booking.create({
      data: {
        room_id: 2,
        start_date: subDays(new Date(), 10),
        end_date: null,
        fee: 1000000,
        tenant_id: tenant.id,
        is_rolling: true,
        status_id: CANCELLED,
      },
    });

    await runBookingStatusSync();

    const after = await testPrisma.booking.findUnique({
      where: { id: booking.id },
    });
    expect(after?.status_id).toBe(CANCELLED);
  });

  it("is a no-op when the feature flag is disabled", async () => {
    await testPrisma.setting.update({
      where: { setting_key: "BOOKING_STATUS_SYNC_ENABLED" },
      data: { setting_value: "false" },
    });

    const tenant = await testPrisma.tenant.create({
      data: { name: "Flag Off Tenant", id_number: "fo1", email: "fo1@test.com" },
    });
    const booking = await testPrisma.booking.create({
      data: {
        room_id: 1,
        start_date: subDays(new Date(), 10),
        end_date: null,
        fee: 1000000,
        tenant_id: tenant.id,
        is_rolling: true,
        status_id: PENDING,
      },
    });

    const result = await runBookingStatusSync();
    expect(result.stats.updated).toBe(0);

    const after = await testPrisma.booking.findUnique({
      where: { id: booking.id },
    });
    expect(after?.status_id).toBe(PENDING);
  });
});
