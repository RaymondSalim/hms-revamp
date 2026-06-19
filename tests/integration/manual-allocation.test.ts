import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { generatePaymentBillMappingFromPaymentsAndBills } from "@/app/_lib/util/payment-allocation";

describe("Manual Allocation Protection", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it("should not overwrite manually-allocated payments during reallocation", async () => {
    const location = await testPrisma.location.create({
      data: { name: "Loc", address: "Addr" },
    });
    const roomType = await testPrisma.roomType.create({
      data: { type: `Type-${Date.now()}` },
    });
    const room = await testPrisma.room.create({
      data: {
        room_number: `R-${Date.now()}`,
        room_type_id: roomType.id,
        status_id: 1,
        location_id: location.id,
      },
    });
    const tenant = await testPrisma.tenant.create({
      data: { name: "Tenant", id_number: "222", email: "m@test.com" },
    });

    const booking = await testPrisma.booking.create({
      data: {
        room_id: room.id,
        start_date: new Date("2025-01-01"),
        end_date: new Date("2025-03-31"),
        fee: 1000000,
        tenant_id: tenant.id,
        is_rolling: false,
      },
    });

    const bill1 = await testPrisma.bill.create({
      data: {
        booking_id: booking.id,
        description: "Tagihan Bulan 1",
        due_date: new Date("2025-01-31"),
      },
    });
    await testPrisma.billItem.create({
      data: { bill_id: bill1.id, description: "Sewa", amount: 1000000, type: "GENERATED" },
    });

    const bill2 = await testPrisma.bill.create({
      data: {
        booking_id: booking.id,
        description: "Tagihan Bulan 2",
        due_date: new Date("2025-02-28"),
      },
    });
    await testPrisma.billItem.create({
      data: { bill_id: bill2.id, description: "Sewa", amount: 1000000, type: "GENERATED" },
    });

    // Manual payment allocated to bill2 specifically (skipping bill1)
    const manualPayment = await testPrisma.payment.create({
      data: {
        booking_id: booking.id,
        amount: 1000000,
        payment_date: new Date("2025-01-10"),
        allocation_mode: "manual",
      },
    });

    await testPrisma.paymentBill.create({
      data: { payment_id: manualPayment.id, bill_id: bill2.id, amount: 1000000 },
    });

    // Trigger reallocation (e.g., because a new bill item was added)
    await generatePaymentBillMappingFromPaymentsAndBills(booking.id);

    // Manual payment should STILL be allocated to bill2
    const manualMappings = await testPrisma.paymentBill.findMany({
      where: { payment_id: manualPayment.id },
    });

    expect(manualMappings).toHaveLength(1);
    expect(manualMappings[0].bill_id).toBe(bill2.id);
    expect(Number(manualMappings[0].amount)).toBe(1000000);
  });

  it("should account for manual allocations when calculating outstanding for auto payments", async () => {
    const location = await testPrisma.location.create({
      data: { name: "Loc2", address: "Addr2" },
    });
    const roomType = await testPrisma.roomType.create({
      data: { type: `Type2-${Date.now()}` },
    });
    const room = await testPrisma.room.create({
      data: {
        room_number: `R2-${Date.now()}`,
        room_type_id: roomType.id,
        status_id: 1,
        location_id: location.id,
      },
    });
    const tenant = await testPrisma.tenant.create({
      data: { name: "Tenant2", id_number: "333", email: "m2@test.com" },
    });

    const booking = await testPrisma.booking.create({
      data: {
        room_id: room.id,
        start_date: new Date("2025-01-01"),
        end_date: new Date("2025-02-28"),
        fee: 1000000,
        tenant_id: tenant.id,
        is_rolling: false,
      },
    });

    const bill1 = await testPrisma.bill.create({
      data: {
        booking_id: booking.id,
        description: "Tagihan Bulan 1",
        due_date: new Date("2025-01-31"),
      },
    });
    await testPrisma.billItem.create({
      data: { bill_id: bill1.id, description: "Sewa", amount: 1000000, type: "GENERATED" },
    });

    const bill2 = await testPrisma.bill.create({
      data: {
        booking_id: booking.id,
        description: "Tagihan Bulan 2",
        due_date: new Date("2025-02-28"),
      },
    });
    await testPrisma.billItem.create({
      data: { bill_id: bill2.id, description: "Sewa", amount: 1000000, type: "GENERATED" },
    });

    // Manual payment of 500K to bill1
    const manualPayment = await testPrisma.payment.create({
      data: {
        booking_id: booking.id,
        amount: 500000,
        payment_date: new Date("2025-01-05"),
        allocation_mode: "manual",
      },
    });
    await testPrisma.paymentBill.create({
      data: { payment_id: manualPayment.id, bill_id: bill1.id, amount: 500000 },
    });

    // Auto payment of 1.5M — should fill remaining 500K of bill1, then 1M to bill2
    await testPrisma.payment.create({
      data: {
        booking_id: booking.id,
        amount: 1500000,
        payment_date: new Date("2025-01-10"),
        allocation_mode: "auto",
      },
    });

    await generatePaymentBillMappingFromPaymentsAndBills(booking.id);

    const autoPayment = await testPrisma.payment.findFirst({
      where: { booking_id: booking.id, allocation_mode: "auto" },
    });

    const autoMappings = await testPrisma.paymentBill.findMany({
      where: { payment_id: autoPayment!.id },
      orderBy: { bill_id: "asc" },
    });

    // Auto payment should get: 500K to bill1 (remaining after manual), 1M to bill2
    expect(autoMappings).toHaveLength(2);
    expect(Number(autoMappings[0].amount)).toBe(500000); // bill1 remaining
    expect(Number(autoMappings[1].amount)).toBe(1000000); // bill2 full
  });
});
