import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { createOrUpdatePaymentTransactions } from "@/app/(internal)/(dashboard_layout)/payments/payment-action";
import {
  getAvailableCredit,
  refundCreditAction,
} from "@/app/(internal)/(dashboard_layout)/credits/credit-action";

describe("Credit Refund Workflow", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it("should track and refund available credit", async () => {
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
      data: { name: "Tenant", id_number: "222", email: "c@test.com" },
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

    expect(await getAvailableCredit(booking.id)).toBe(500000);

    const r1 = await refundCreditAction(booking.id, 200000);
    expect(r1.success).toBe(true);
    expect(await getAvailableCredit(booking.id)).toBe(300000);

    const r2 = await refundCreditAction(booking.id, 300000);
    expect(r2.success).toBe(true);
    expect(await getAvailableCredit(booking.id)).toBe(0);

    const r3 = await refundCreditAction(booking.id, 1);
    expect(r3.success).toBe(false);
  });
});
