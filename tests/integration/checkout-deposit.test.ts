import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { checkInOutAction } from "@/app/(internal)/(dashboard_layout)/bookings/booking-action";

describe("Check-Out Deposit Handling (BL-034)", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it("should create EXPENSE transaction when refunding deposit on checkout", async () => {
    const tenant = await testPrisma.tenant.create({
      data: { name: "Test Tenant", id_number: "123", email: "t@test.com" },
    });

    const booking = await testPrisma.booking.create({
      data: {
        room_id: 1,
        start_date: new Date("2025-01-01"),
        end_date: new Date("2025-03-31"),
        fee: 3000000,
        tenant_id: tenant.id,
        is_rolling: false,
        status_id: 2,
      },
    });

    const deposit = await testPrisma.deposit.create({
      data: {
        booking_id: booking.id,
        amount: 1000000,
        status: "HELD",
      },
    });

    await checkInOutAction({
      booking_id: booking.id,
      event_type: "CHECK_OUT",
      event_date: new Date("2025-03-31"),
      tenant_id: tenant.id,
      deposit_status: "REFUNDED",
      refunded_amount: 1000000,
    });

    // Deposit should be REFUNDED
    const updatedDeposit = await testPrisma.deposit.findUnique({
      where: { id: deposit.id },
    });
    expect(updatedDeposit!.status).toBe("REFUNDED");
    expect(Number(updatedDeposit!.refunded_amount)).toBe(1000000);
    expect(updatedDeposit!.refunded_at).not.toBeNull();

    // EXPENSE transaction should exist
    const transactions = await testPrisma.transaction.findMany({
      where: {
        related_id: { path: ["deposit_id"], equals: deposit.id },
        type: "EXPENSE",
      },
    });
    expect(transactions).toHaveLength(1);
    expect(Number(transactions[0].amount)).toBe(1000000);
    expect(transactions[0].category).toBe("Deposit");
  });

  it("should NOT create transaction when deposit is APPLIED on checkout", async () => {
    const tenant = await testPrisma.tenant.create({
      data: { name: "Test Tenant 2", id_number: "456", email: "t2@test.com" },
    });

    const booking = await testPrisma.booking.create({
      data: {
        room_id: 1,
        start_date: new Date("2025-01-01"),
        end_date: new Date("2025-03-31"),
        fee: 3000000,
        tenant_id: tenant.id,
        is_rolling: false,
        status_id: 2,
      },
    });

    const deposit = await testPrisma.deposit.create({
      data: {
        booking_id: booking.id,
        amount: 1000000,
        status: "HELD",
      },
    });

    await checkInOutAction({
      booking_id: booking.id,
      event_type: "CHECK_OUT",
      event_date: new Date("2025-03-31"),
      tenant_id: tenant.id,
      deposit_status: "APPLIED",
    });

    const updatedDeposit = await testPrisma.deposit.findUnique({
      where: { id: deposit.id },
    });
    expect(updatedDeposit!.status).toBe("APPLIED");
    expect(updatedDeposit!.applied_at).not.toBeNull();

    // No EXPENSE transaction for APPLIED
    const transactions = await testPrisma.transaction.findMany({
      where: {
        related_id: { path: ["deposit_id"], equals: deposit.id },
        type: "EXPENSE",
      },
    });
    expect(transactions).toHaveLength(0);
  });

  it("should reject invalid deposit transition on checkout", async () => {
    const tenant = await testPrisma.tenant.create({
      data: { name: "Test Tenant 3", id_number: "789", email: "t3@test.com" },
    });

    const booking = await testPrisma.booking.create({
      data: {
        room_id: 1,
        start_date: new Date("2025-01-01"),
        end_date: new Date("2025-03-31"),
        fee: 3000000,
        tenant_id: tenant.id,
        is_rolling: false,
        status_id: 2,
      },
    });

    // Deposit is UNPAID (not HELD) — transition should fail
    await testPrisma.deposit.create({
      data: {
        booking_id: booking.id,
        amount: 1000000,
        status: "UNPAID",
      },
    });

    const result = await checkInOutAction({
      booking_id: booking.id,
      event_type: "CHECK_OUT",
      event_date: new Date("2025-03-31"),
      tenant_id: tenant.id,
      deposit_status: "REFUNDED",
      refunded_amount: 1000000,
    });

    expect(result.success).toBe(false);
  });
});
