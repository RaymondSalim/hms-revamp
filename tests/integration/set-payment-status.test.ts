import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import { setPaymentStatusAction } from "@/app/(internal)/(dashboard_layout)/payments/payment-action";
import { PAYMENT_STATUS } from "@/app/_lib/util/status";

describe("setPaymentStatusAction", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  async function setup() {
    const tenant = await testPrisma.tenant.create({
      data: { name: "T", id_number: `${Date.now()}`, email: `t${Date.now()}@t.com` },
    });
    const booking = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: tenant.id, start_date: new Date("2025-01-01"), end_date: new Date("2025-01-31"), fee: 3000000, is_rolling: false },
    });
    const bill = await testPrisma.bill.create({
      data: { booking_id: booking.id, description: "Tagihan", due_date: new Date("2025-01-31") },
    });
    await testPrisma.billItem.create({
      data: { bill_id: bill.id, description: "Biaya Sewa", amount: 3000000, type: "GENERATED" },
    });
    const payment = await testPrisma.payment.create({
      data: { booking_id: booking.id, amount: 3000000, payment_date: new Date("2025-01-05"), status_id: PAYMENT_STATUS.PENDING },
    });
    await testPrisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill.id, amount: 3000000 },
    });
    return { payment };
  }

  function txnsFor(paymentId: number) {
    return testPrisma.transaction.findMany({
      where: { related_id: { path: ["payment_id"], equals: paymentId } },
    });
  }

  it("VERIFIED flips status and creates transactions", async () => {
    const { payment } = await setup();
    const res = await setPaymentStatusAction(payment.id, PAYMENT_STATUS.VERIFIED);
    expect(res.success).toBe(true);

    const updated = await testPrisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated?.status_id).toBe(PAYMENT_STATUS.VERIFIED);
    expect(await txnsFor(payment.id)).toHaveLength(1);
  });

  it("REJECTED flips status and removes transactions (delete-and-recreate)", async () => {
    const { payment } = await setup();
    // first verify (creates a transaction)
    await setPaymentStatusAction(payment.id, PAYMENT_STATUS.VERIFIED);
    expect(await txnsFor(payment.id)).toHaveLength(1);

    // then reject
    const res = await setPaymentStatusAction(payment.id, PAYMENT_STATUS.REJECTED);
    expect(res.success).toBe(true);
    const updated = await testPrisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated?.status_id).toBe(PAYMENT_STATUS.REJECTED);
    expect(await txnsFor(payment.id)).toHaveLength(0);
  });

  it("returns an error for a missing payment", async () => {
    const res = await setPaymentStatusAction(999999, PAYMENT_STATUS.VERIFIED);
    expect(res.success).toBe(false);
  });
});
