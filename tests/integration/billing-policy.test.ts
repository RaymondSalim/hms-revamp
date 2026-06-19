import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import {
  mergePolicy,
  resolveBillingPolicy,
} from "@/app/_lib/util/billing-policy";
import { upsertBookingAction } from "@/app/(internal)/(dashboard_layout)/bookings/booking-action";

describe("BillingPolicy cascade resolution", () => {
  beforeEach(async () => {
    await cleanDatabase();
    // NOTE: seedTestData seeds a system-default policy, so for the "no rows"
    // test we clean again and seed only the non-policy base data manually.
    await seedTestData();
  });

  it("returns hardcoded defaults when no policy rows exist", async () => {
    // Remove the seeded system default to test the no-row fallback path.
    await testPrisma.billingPolicy.deleteMany({});

    const policy = await resolveBillingPolicy(null, null);
    expect(policy.proration_method).toBe("daily");
    expect(policy.grace_period_days).toBe(0);
    expect(policy.billing_cycle_day).toBe(0);
    expect(policy.reminder_days_before).toBe(7);
    expect(policy.tax_rate).toBe(0);
    expect(policy.late_fee_type).toBeNull();
    expect(policy.late_fee_amount).toBe(0);
    expect(policy.rate_escalation_percentage).toBe(0);
    expect(policy.rate_escalation_frequency).toBeNull();
  });

  it("returns the system default values when only system policy exists", async () => {
    await testPrisma.billingPolicy.deleteMany({});
    await testPrisma.billingPolicy.create({
      data: {
        proration_method: "none",
        grace_period_days: 5,
        reminder_days_before: 3,
        tax_rate: 11,
        late_fee_type: "flat",
        late_fee_amount: 50000,
      },
    });

    const policy = await resolveBillingPolicy(null, null);
    expect(policy.proration_method).toBe("none");
    expect(policy.grace_period_days).toBe(5);
    expect(policy.reminder_days_before).toBe(3);
    expect(policy.tax_rate).toBe(11);
    expect(policy.late_fee_type).toBe("flat");
    expect(policy.late_fee_amount).toBe(50000);
  });

  it("lets location override win over system, system fills the rest", async () => {
    await testPrisma.billingPolicy.deleteMany({});
    // System: daily proration, grace 5, reminder 7
    await testPrisma.billingPolicy.create({
      data: {
        proration_method: "daily",
        grace_period_days: 5,
        reminder_days_before: 7,
        tax_rate: 11,
      },
    });
    // Location 1 override: only proration_method + grace
    await testPrisma.billingPolicy.create({
      data: {
        location_id: 1,
        proration_method: "none",
        grace_period_days: 10,
      },
    });

    const policy = await resolveBillingPolicy(null, 1);
    // Location wins
    expect(policy.proration_method).toBe("none");
    expect(policy.grace_period_days).toBe(10);
    // System fills the rest
    expect(policy.reminder_days_before).toBe(7);
    expect(policy.tax_rate).toBe(11);
  });

  it("lets booking override win over location and system", async () => {
    await testPrisma.billingPolicy.deleteMany({});
    const tenant = await testPrisma.tenant.create({
      data: { name: "Policy Tenant", id_number: "p-1", email: "p1@test.com" },
    });
    const booking = await testPrisma.booking.create({
      data: {
        room_id: 1,
        start_date: new Date("2025-01-01"),
        fee: 1000000,
        tenant_id: tenant.id,
        is_rolling: true,
        status_id: 2,
      },
    });

    await testPrisma.billingPolicy.create({
      data: { proration_method: "daily", grace_period_days: 1, tax_rate: 11 },
    });
    await testPrisma.billingPolicy.create({
      data: { location_id: 1, proration_method: "daily", grace_period_days: 5 },
    });
    await testPrisma.billingPolicy.create({
      data: {
        booking_id: booking.id,
        proration_method: "none",
        grace_period_days: 9,
      },
    });

    const policy = await resolveBillingPolicy(booking.id, 1);
    // Booking wins
    expect(policy.proration_method).toBe("none");
    expect(policy.grace_period_days).toBe(9);
    // System fills tax_rate (not set at booking/location)
    expect(policy.tax_rate).toBe(11);
  });

  it("mergePolicy merges layers with booking > location > system priority", () => {
    const merged = mergePolicy(
      { proration_method: "daily", grace_period_days: 1, tax_rate: 11 },
      { proration_method: "none", grace_period_days: 5 },
      { grace_period_days: 9 }
    );
    expect(merged.proration_method).toBe("none"); // from location
    expect(merged.grace_period_days).toBe(9); // from booking
    expect(merged.tax_rate).toBe(11); // from system
  });

  it("does not prorate first month when location policy proration_method is 'none'", async () => {
    await testPrisma.billingPolicy.deleteMany({});
    // System default: daily
    await testPrisma.billingPolicy.create({
      data: { proration_method: "daily" },
    });
    // Location 1 override: none
    await testPrisma.billingPolicy.create({
      data: { location_id: 1, proration_method: "none" },
    });

    const tenant = await testPrisma.tenant.create({
      data: { name: "NoProrate Tenant", id_number: "np-1", email: "np@test.com" },
    });

    // Booking starts mid-month (Jan 15). Room 1 is in location 1.
    await upsertBookingAction({
      room_id: 1,
      start_date: new Date("2025-01-15"),
      duration_id: null,
      fee: 3100000,
      tenant_id: tenant.id,
      is_rolling: true,
      status_id: 2,
    });

    const booking = await testPrisma.booking.findFirst({
      where: { tenant_id: tenant.id },
    });
    const bills = await testPrisma.bill.findMany({
      where: { booking_id: booking!.id },
      include: { bill_item: true },
      orderBy: { due_date: "asc" },
    });
    const firstRoomItem = bills[0].bill_item.find(
      (i) => i.description === "Biaya Sewa"
    );
    // proration_method "none" => full fee, NOT prorated
    expect(Number(firstRoomItem!.amount)).toBe(3100000);
  });

  it("prorates first month by default (daily) for a different location", async () => {
    await testPrisma.billingPolicy.deleteMany({});
    // System default: daily, no location override -> room 2 (location 1) uses daily
    await testPrisma.billingPolicy.create({
      data: { proration_method: "daily" },
    });

    const tenant = await testPrisma.tenant.create({
      data: { name: "Prorate Tenant", id_number: "pr-1", email: "pr@test.com" },
    });

    // Jan 15 start, fee 3,100,000 -> (31-15+1)/31 * 3,100,000 = 1,700,000
    await upsertBookingAction({
      room_id: 2,
      start_date: new Date("2025-01-15"),
      duration_id: null,
      fee: 3100000,
      tenant_id: tenant.id,
      is_rolling: true,
      status_id: 2,
    });

    const booking = await testPrisma.booking.findFirst({
      where: { tenant_id: tenant.id },
    });
    const bills = await testPrisma.bill.findMany({
      where: { booking_id: booking!.id },
      include: { bill_item: true },
      orderBy: { due_date: "asc" },
    });
    const firstRoomItem = bills[0].bill_item.find(
      (i) => i.description === "Biaya Sewa"
    );
    // (17/31) * 3,100,000 = 1,700,000
    expect(Number(firstRoomItem!.amount)).toBe(1700000);
  });
});
