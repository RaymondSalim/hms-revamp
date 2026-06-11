import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { getAgingReport, bucketForAge } from "@/app/_db/reports";

describe("bucketForAge", () => {
  it("buckets ages into the correct AR aging bucket", () => {
    expect(bucketForAge(-5)).toBe("current");
    expect(bucketForAge(0)).toBe("current");
    expect(bucketForAge(15)).toBe("d1_30");
    expect(bucketForAge(45)).toBe("d31_60");
    expect(bucketForAge(75)).toBe("d61_90");
    expect(bucketForAge(120)).toBe("d90_plus");
  });

  it("handles bucket boundaries correctly", () => {
    expect(bucketForAge(1)).toBe("d1_30");
    expect(bucketForAge(30)).toBe("d1_30");
    expect(bucketForAge(31)).toBe("d31_60");
    expect(bucketForAge(60)).toBe("d31_60");
    expect(bucketForAge(61)).toBe("d61_90");
    expect(bucketForAge(90)).toBe("d61_90");
    expect(bucketForAge(91)).toBe("d90_plus");
  });
});

describe("getAgingReport", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  // Fixed reference date so age computation is deterministic.
  const ASOF = new Date("2025-06-30T00:00:00.000Z");

  async function createTenant(name: string) {
    return testPrisma.tenant.create({
      data: { name, id_number: `id-${name}-${Date.now()}` },
    });
  }

  async function createBooking(roomId: number, tenantId: string) {
    return testPrisma.booking.create({
      data: {
        room_id: roomId,
        tenant_id: tenantId,
        start_date: new Date("2025-01-01"),
        end_date: new Date("2025-12-31"),
        fee: 1000000,
        is_rolling: false,
      },
    });
  }

  async function createBill(
    bookingId: number,
    dueDate: string,
    amount: number,
    paid?: number
  ) {
    const bill = await testPrisma.bill.create({
      data: {
        booking_id: bookingId,
        description: `Tagihan ${dueDate}`,
        due_date: new Date(dueDate),
      },
    });
    await testPrisma.billItem.create({
      data: {
        bill_id: bill.id,
        description: "Biaya Sewa",
        amount,
        type: "GENERATED",
      },
    });
    if (paid && paid > 0) {
      const payment = await testPrisma.payment.create({
        data: {
          booking_id: bookingId,
          amount: paid,
          payment_date: new Date(dueDate),
        },
      });
      await testPrisma.paymentBill.create({
        data: { payment_id: payment.id, bill_id: bill.id, amount: paid },
      });
    }
    return bill;
  }

  it("buckets outstanding bills by age and aggregates per tenant", async () => {
    const tenant = await createTenant("Andi");
    const booking = await createBooking(1, tenant.id);

    // Relative to ASOF 2025-06-30:
    // due 2025-07-15 → age -15 → current
    await createBill(booking.id, "2025-07-15", 100000);
    // due 2025-06-20 → age 10 → d1_30
    await createBill(booking.id, "2025-06-20", 200000);
    // due 2025-05-20 → age 41 → d31_60
    await createBill(booking.id, "2025-05-20", 300000);
    // due 2025-04-15 → age 76 → d61_90
    await createBill(booking.id, "2025-04-15", 400000);
    // due 2025-01-15 → age 166 → d90_plus
    await createBill(booking.id, "2025-01-15", 500000);

    const report = await getAgingReport(null, ASOF);

    expect(report.tenants).toHaveLength(1);
    const row = report.tenants[0];
    expect(row.tenant_id).toBe(tenant.id);
    expect(row.tenant_name).toBe("Andi");
    expect(row.location_name).toBe("Test Location");
    expect(row.current).toBe(100000);
    expect(row.d1_30).toBe(200000);
    expect(row.d31_60).toBe(300000);
    expect(row.d61_90).toBe(400000);
    expect(row.d90_plus).toBe(500000);
    expect(row.total).toBe(1500000);

    expect(report.totals.current).toBe(100000);
    expect(report.totals.d1_30).toBe(200000);
    expect(report.totals.d31_60).toBe(300000);
    expect(report.totals.d61_90).toBe(400000);
    expect(report.totals.d90_plus).toBe(500000);
    expect(report.totals.total).toBe(1500000);
  });

  it("uses outstanding (total - paid) and excludes fully-paid bills", async () => {
    const tenant = await createTenant("Budi");
    const booking = await createBooking(1, tenant.id);

    // Partially paid: 500000 - 200000 = 300000 outstanding, due age 10 → d1_30
    await createBill(booking.id, "2025-06-20", 500000, 200000);
    // Fully paid → excluded
    await createBill(booking.id, "2025-05-20", 400000, 400000);

    const report = await getAgingReport(null, ASOF);

    expect(report.tenants).toHaveLength(1);
    const row = report.tenants[0];
    expect(row.d1_30).toBe(300000);
    expect(row.total).toBe(300000);
    expect(report.totals.total).toBe(300000);
  });

  it("aggregates multiple tenants and supports location filtering", async () => {
    const tenantA = await createTenant("Citra");
    const bookingA = await createBooking(1, tenantA.id);
    await createBill(bookingA.id, "2025-06-20", 100000); // d1_30

    const tenantB = await createTenant("Dewi");
    const bookingB = await createBooking(2, tenantB.id);
    await createBill(bookingB.id, "2025-04-15", 250000); // d61_90

    const report = await getAgingReport(null, ASOF);
    expect(report.tenants).toHaveLength(2);
    expect(report.totals.total).toBe(350000);

    // Both rooms 1 and 2 are in location 1 per seed data.
    const filtered = await getAgingReport(1, ASOF);
    expect(filtered.totals.total).toBe(350000);

    const otherLocation = await getAgingReport(999, ASOF);
    expect(otherLocation.tenants).toHaveLength(0);
    expect(otherLocation.totals.total).toBe(0);
  });
});
