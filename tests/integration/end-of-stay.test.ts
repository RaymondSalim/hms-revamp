import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import {
  upsertBookingAction,
  scheduleEndOfStayAction,
} from "@/app/(internal)/(dashboard_layout)/bookings/booking-action";
import { createOrUpdatePaymentTransactions } from "@/app/(internal)/(dashboard_layout)/payments/payment-action";
import { generatePaymentBillMappingFromPaymentsAndBills } from "@/app/(internal)/(dashboard_layout)/bills/bill-action";

describe("End of Stay (BL-033)", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it("should reallocate payments after scheduling end of stay", async () => {
    const tenant = await testPrisma.tenant.create({
      data: { name: "Test Tenant", id_number: "123", email: "t@test.com" },
    });

    // Create rolling booking starting Jan 1
    await upsertBookingAction({
      room_id: 1,
      start_date: new Date("2025-01-01"),
      duration_id: null,
      fee: 1000000,
      tenant_id: tenant.id,
      is_rolling: true,
      status_id: 2,
    });

    const booking = await testPrisma.booking.findFirst({
      where: { tenant_id: tenant.id },
    });

    // Payment of 2M (covers 2 months)
    const payment = await testPrisma.payment.create({
      data: {
        booking_id: booking!.id,
        amount: 2000000,
        payment_date: new Date("2025-01-05"),
      },
    });

    await generatePaymentBillMappingFromPaymentsAndBills(booking!.id);
    await createOrUpdatePaymentTransactions(payment.id);

    // Verify payment is allocated across bills
    const mappingsBefore = await testPrisma.paymentBill.findMany({
      where: { payment_id: payment.id },
    });
    expect(mappingsBefore.length).toBeGreaterThanOrEqual(1);

    // Schedule end of stay at end of January (deletes Feb+ bills)
    await scheduleEndOfStayAction(booking!.id, new Date("2025-01-31"));

    // After: payment should still be fully allocated to remaining bill(s)
    const mappingsAfter = await testPrisma.paymentBill.findMany({
      where: { payment_id: payment.id },
    });
    const totalAllocated = mappingsAfter.reduce(
      (s, m) => s + Number(m.amount),
      0
    );

    // Payment 2M should be allocated up to what bills can absorb
    expect(totalAllocated).toBeGreaterThan(0);

    // Transactions should reflect current state
    const transactions = await testPrisma.transaction.findMany({
      where: { related_id: { path: ["payment_id"], equals: payment.id } },
    });
    expect(transactions.length).toBeGreaterThan(0);
    expect(Number(transactions[0].amount)).toBe(totalAllocated);
  });
});
