import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { createOrUpdatePaymentTransactions } from "@/app/(internal)/(dashboard_layout)/payments/payment-action";

describe("Overpayment Handling", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it("should create separate 'Kelebihan Bayar' transaction for excess payment", async () => {
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
      data: { name: "Tenant", id_number: "111", email: "o@test.com" },
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

    // Payment of 3.5M for a 3M bill (500K overpayment)
    const payment = await testPrisma.payment.create({
      data: {
        booking_id: booking.id,
        amount: 3500000,
        payment_date: new Date("2025-01-05"),
      },
    });

    await testPrisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill.id, amount: 3500000 },
    });

    await createOrUpdatePaymentTransactions(payment.id);

    const transactions = await testPrisma.transaction.findMany({
      where: { related_id: { path: ["payment_id"], equals: payment.id } },
      orderBy: { description: "asc" },
    });

    // Should have 2 transactions: "Biaya Sewa" (3M) and "Kelebihan Bayar" (500K)
    expect(transactions).toHaveLength(2);

    const roomTx = transactions.find((t) => t.description === "Biaya Sewa");
    const excessTx = transactions.find(
      (t) => t.description === "Kelebihan Bayar"
    );

    expect(roomTx).toBeDefined();
    expect(Number(roomTx!.amount)).toBe(3000000);

    expect(excessTx).toBeDefined();
    expect(Number(excessTx!.amount)).toBe(500000);
    expect(excessTx!.type).toBe("CREDIT");
    expect(excessTx!.category).toBe("Kelebihan Bayar");
  });
});
