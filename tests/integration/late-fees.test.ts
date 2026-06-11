import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import { addDays } from "date-fns";

import { computeLateFee } from "@/app/_lib/util/billing-policy";
import { runLateFees } from "@/app/api/cron/late-fees/route";

const NOW = new Date("2026-06-11T00:00:00.000Z");

async function enableFlag() {
  await testPrisma.setting.upsert({
    where: { setting_key: "LATE_FEE_AUTOMATION_ENABLED" },
    update: { setting_value: "true" },
    create: {
      setting_key: "LATE_FEE_AUTOMATION_ENABLED",
      setting_value: "true",
    },
  });
}

/**
 * Creates a booking on room 1 (location 1) with a single bill due `dueDaysAgo`
 * days before NOW, plus a single unpaid bill_item of `itemAmount`.
 */
async function createOverdueBooking(opts: {
  dueDaysAgo: number;
  itemAmount: number;
  idSuffix: string;
}) {
  const tenant = await testPrisma.tenant.create({
    data: {
      name: `Late Fee Tenant ${opts.idSuffix}`,
      id_number: `lf-${opts.idSuffix}`,
      email: `lf-${opts.idSuffix}@test.com`,
    },
  });
  const booking = await testPrisma.booking.create({
    data: {
      room_id: 1,
      start_date: new Date("2026-01-01"),
      fee: 1000000,
      tenant_id: tenant.id,
      is_rolling: true,
      status_id: 2,
    },
  });
  const bill = await testPrisma.bill.create({
    data: {
      booking_id: booking.id,
      description: "Tagihan",
      due_date: addDays(NOW, -opts.dueDaysAgo),
    },
  });
  await testPrisma.billItem.create({
    data: {
      bill_id: bill.id,
      description: "Biaya Sewa",
      amount: opts.itemAmount,
      type: "GENERATED",
    },
  });
  return { booking, bill };
}

async function createLocationPolicy(data: {
  late_fee_type: string;
  late_fee_amount: number;
  grace_period_days: number;
}) {
  await testPrisma.billingPolicy.create({
    data: {
      location_id: 1,
      late_fee_type: data.late_fee_type,
      late_fee_amount: data.late_fee_amount,
      grace_period_days: data.grace_period_days,
    },
  });
}

describe("computeLateFee (pure)", () => {
  it("flat returns the flat amount regardless of outstanding", () => {
    expect(computeLateFee(1234567, "flat", 50000)).toBe(50000);
  });

  it("percentage applies and rounds", () => {
    expect(computeLateFee(1000000, "percentage", 5)).toBe(50000);
    expect(computeLateFee(999999, "percentage", 5)).toBe(50000); // 49999.95 -> 50000
  });

  it("null/unknown type returns 0", () => {
    expect(computeLateFee(1000000, null, 50000)).toBe(0);
    expect(computeLateFee(1000000, "weird", 50000)).toBe(0);
  });
});

describe("runLateFees cron", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it("creates a flat penalty and bill item on an overdue bill", async () => {
    await createLocationPolicy({
      late_fee_type: "flat",
      late_fee_amount: 50000,
      grace_period_days: 5,
    });
    await enableFlag();
    const { booking, bill } = await createOverdueBooking({
      dueDaysAgo: 30,
      itemAmount: 1000000,
      idSuffix: "flat",
    });

    const result = await runLateFees(NOW);
    expect(result.stats.created).toBe(1);

    const penalties = await testPrisma.penalty.findMany({
      where: { booking_id: booking.id },
    });
    expect(penalties).toHaveLength(1);
    expect(Number(penalties[0].amount)).toBe(50000);
    expect(penalties[0].bill_id).toBe(bill.id);

    const lateFeeItems = await testPrisma.billItem.findMany({
      where: { bill_id: bill.id, description: "Denda Keterlambatan" },
    });
    expect(lateFeeItems).toHaveLength(1);
    expect(Number(lateFeeItems[0].amount)).toBe(50000);
    expect(lateFeeItems[0].related_id).toEqual({ penalty: true });
  });

  it("is idempotent: a second run creates no further penalty", async () => {
    await createLocationPolicy({
      late_fee_type: "flat",
      late_fee_amount: 50000,
      grace_period_days: 5,
    });
    await enableFlag();
    const { booking } = await createOverdueBooking({
      dueDaysAgo: 30,
      itemAmount: 1000000,
      idSuffix: "idem",
    });

    await runLateFees(NOW);
    const second = await runLateFees(NOW);
    expect(second.stats.created).toBe(0);

    const penalties = await testPrisma.penalty.findMany({
      where: { booking_id: booking.id },
    });
    expect(penalties).toHaveLength(1);
  });

  it("does not charge a bill still within the grace period", async () => {
    await createLocationPolicy({
      late_fee_type: "flat",
      late_fee_amount: 50000,
      grace_period_days: 5,
    });
    await enableFlag();
    const { booking } = await createOverdueBooking({
      dueDaysAgo: 2, // due 2 days ago, grace 5 -> still within grace
      itemAmount: 1000000,
      idSuffix: "grace",
    });

    const result = await runLateFees(NOW);
    expect(result.stats.created).toBe(0);
    const penalties = await testPrisma.penalty.findMany({
      where: { booking_id: booking.id },
    });
    expect(penalties).toHaveLength(0);
  });

  it("does not charge a fully paid bill (outstanding 0)", async () => {
    await createLocationPolicy({
      late_fee_type: "flat",
      late_fee_amount: 50000,
      grace_period_days: 5,
    });
    await enableFlag();
    const { booking, bill } = await createOverdueBooking({
      dueDaysAgo: 30,
      itemAmount: 1000000,
      idSuffix: "paid",
    });
    // Fully pay the bill.
    const payment = await testPrisma.payment.create({
      data: {
        booking_id: booking.id,
        amount: 1000000,
        status_id: 2,
        payment_date: NOW,
      },
    });
    await testPrisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill.id, amount: 1000000 },
    });

    const result = await runLateFees(NOW);
    expect(result.stats.created).toBe(0);
    const penalties = await testPrisma.penalty.findMany({
      where: { booking_id: booking.id },
    });
    expect(penalties).toHaveLength(0);
  });

  it("computes a percentage late fee on the outstanding balance", async () => {
    await createLocationPolicy({
      late_fee_type: "percentage",
      late_fee_amount: 5,
      grace_period_days: 0,
    });
    await enableFlag();
    const { booking } = await createOverdueBooking({
      dueDaysAgo: 30,
      itemAmount: 1000000,
      idSuffix: "pct",
    });

    const result = await runLateFees(NOW);
    expect(result.stats.created).toBe(1);
    const penalties = await testPrisma.penalty.findMany({
      where: { booking_id: booking.id },
    });
    expect(Number(penalties[0].amount)).toBe(50000); // 5% of 1,000,000
  });

  it("creates no penalties when the feature flag is off", async () => {
    await createLocationPolicy({
      late_fee_type: "flat",
      late_fee_amount: 50000,
      grace_period_days: 5,
    });
    // Flag intentionally NOT enabled.
    const { booking } = await createOverdueBooking({
      dueDaysAgo: 30,
      itemAmount: 1000000,
      idSuffix: "off",
    });

    const result = await runLateFees(NOW);
    expect(result.stats.created).toBe(0);
    const penalties = await testPrisma.penalty.findMany({
      where: { booking_id: booking.id },
    });
    expect(penalties).toHaveLength(0);
  });
});
