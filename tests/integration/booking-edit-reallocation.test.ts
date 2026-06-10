import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { upsertBookingAction } from "@/app/(internal)/(dashboard_layout)/bookings/booking-action";
import { createOrUpdatePaymentTransactions } from "@/app/(internal)/(dashboard_layout)/payments/payment-action";

describe("Booking Edit Payment Reallocation (BL-032)", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it("should reallocate payments when booking fee changes", async () => {
    const tenant = await testPrisma.tenant.create({
      data: { name: "Test Tenant", id_number: "123", email: "t@test.com" },
    });

    await upsertBookingAction({
      room_id: 1,
      start_date: new Date("2025-01-01"),
      duration_id: 1, // 1 month
      fee: 3000000,
      tenant_id: tenant.id,
      is_rolling: false,
      status_id: 2,
    });

    const booking = await testPrisma.booking.findFirst({
      where: { tenant_id: tenant.id },
    });

    // Create a payment of 3M mapped to the bill
    const payment = await testPrisma.payment.create({
      data: {
        booking_id: booking!.id,
        amount: 3000000,
        payment_date: new Date("2025-01-05"),
      },
    });

    const bill = await testPrisma.bill.findFirst({
      where: { booking_id: booking!.id },
    });

    await testPrisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill!.id, amount: 3000000 },
    });

    await createOrUpdatePaymentTransactions(payment.id);

    // Edit booking: change fee to 4M
    await upsertBookingAction({
      id: booking!.id,
      room_id: 1,
      start_date: new Date("2025-01-01"),
      duration_id: 1,
      fee: 4000000,
      tenant_id: tenant.id,
      is_rolling: false,
      status_id: 2,
    });

    // After edit: payment-bill mappings should exist for the new bill
    const newBill = await testPrisma.bill.findFirst({
      where: { booking_id: booking!.id },
      include: { paymentBills: true, bill_item: true },
    });

    expect(newBill).not.toBeNull();
    expect(newBill!.paymentBills).toHaveLength(1);
    expect(Number(newBill!.paymentBills[0].amount)).toBe(3000000);

    // Transaction should still exist
    const transactions = await testPrisma.transaction.findMany({
      where: { related_id: { path: ["payment_id"], equals: payment.id } },
    });
    expect(transactions.length).toBeGreaterThan(0);
  });
});
