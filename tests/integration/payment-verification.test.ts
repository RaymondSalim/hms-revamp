import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { createOrUpdatePaymentTransactions } from "@/app/(internal)/(dashboard_layout)/payments/payment-action";

describe("Payment Verification Gate", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  async function createTestSetup() {
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
      data: { name: "Tenant", id_number: `${Date.now()}`, email: `v${Date.now()}@test.com` },
    });

    const booking = await testPrisma.booking.create({
      data: {
        room_id: room.id,
        start_date: new Date("2025-01-01"),
        end_date: new Date("2025-01-31"),
        fee: 3000000,
        tenant_id: tenant.id,
        is_rolling: false,
      },
    });

    const bill = await testPrisma.bill.create({
      data: {
        booking_id: booking.id,
        description: "Tagihan Bulan 1",
        due_date: new Date("2025-01-31"),
      },
    });

    await testPrisma.billItem.create({
      data: {
        bill_id: bill.id,
        description: "Biaya Sewa",
        amount: 3000000,
        type: "GENERATED",
      },
    });

    return { booking, bill };
  }

  it("should NOT create transactions for PENDING payment (status_id=1)", async () => {
    const { booking, bill } = await createTestSetup();

    const payment = await testPrisma.payment.create({
      data: {
        booking_id: booking.id,
        amount: 3000000,
        payment_date: new Date("2025-01-05"),
        status_id: 1,
      },
    });

    await testPrisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill.id, amount: 3000000 },
    });

    await createOrUpdatePaymentTransactions(payment.id);

    const transactions = await testPrisma.transaction.findMany({
      where: { related_id: { path: ["payment_id"], equals: payment.id } },
    });

    expect(transactions).toHaveLength(0);
  });

  it("should create transactions for VERIFIED payment (status_id=2)", async () => {
    const { booking, bill } = await createTestSetup();

    const payment = await testPrisma.payment.create({
      data: {
        booking_id: booking.id,
        amount: 3000000,
        payment_date: new Date("2025-01-05"),
        status_id: 2,
      },
    });

    await testPrisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill.id, amount: 3000000 },
    });

    await createOrUpdatePaymentTransactions(payment.id);

    const transactions = await testPrisma.transaction.findMany({
      where: { related_id: { path: ["payment_id"], equals: payment.id } },
    });

    expect(transactions).toHaveLength(1);
    expect(Number(transactions[0].amount)).toBe(3000000);
  });

  it("should create transactions for payment with null status (backwards compatible)", async () => {
    const { booking, bill } = await createTestSetup();

    const payment = await testPrisma.payment.create({
      data: {
        booking_id: booking.id,
        amount: 3000000,
        payment_date: new Date("2025-01-05"),
        status_id: null,
      },
    });

    await testPrisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill.id, amount: 3000000 },
    });

    await createOrUpdatePaymentTransactions(payment.id);

    const transactions = await testPrisma.transaction.findMany({
      where: { related_id: { path: ["payment_id"], equals: payment.id } },
    });

    expect(transactions).toHaveLength(1);
  });

  it("should NOT create transactions for REJECTED payment (status_id=3)", async () => {
    const { booking, bill } = await createTestSetup();

    const payment = await testPrisma.payment.create({
      data: {
        booking_id: booking.id,
        amount: 3000000,
        payment_date: new Date("2025-01-05"),
        status_id: 3,
      },
    });

    await testPrisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill.id, amount: 3000000 },
    });

    await createOrUpdatePaymentTransactions(payment.id);

    const transactions = await testPrisma.transaction.findMany({
      where: { related_id: { path: ["payment_id"], equals: payment.id } },
    });

    expect(transactions).toHaveLength(0);
  });
});
