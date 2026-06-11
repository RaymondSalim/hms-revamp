import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import {
  upsertBookingAction,
  scheduleEndOfStayAction,
} from "@/app/(internal)/(dashboard_layout)/bookings/booking-action";

describe("PPN tax on generated bills (P2-2)", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  // Sets the seeded system-default policy's tax_rate.
  async function setSystemTaxRate(rate: number) {
    const sys = await testPrisma.billingPolicy.findFirst({
      where: { location_id: null, booking_id: null },
    });
    await testPrisma.billingPolicy.update({
      where: { id: sys!.id },
      data: { tax_rate: rate, proration_method: "daily" },
    });
  }

  it("adds a PPN 11% item = 11% of the room fee, excluding deposit", async () => {
    await setSystemTaxRate(11);

    const tenant = await testPrisma.tenant.create({
      data: { name: "Tax Tenant", id_number: "tx-1", email: "tx1@test.com" },
    });

    // Rolling booking starting on the 1st (no proration) so room fee is full.
    await upsertBookingAction({
      room_id: 1,
      start_date: new Date("2025-01-01"),
      duration_id: null,
      fee: 1000000,
      tenant_id: tenant.id,
      is_rolling: true,
      status_id: 2,
      deposit_amount: 500000,
    });

    const booking = await testPrisma.booking.findFirst({
      where: { tenant_id: tenant.id },
    });
    const bills = await testPrisma.bill.findMany({
      where: { booking_id: booking!.id },
      include: { bill_item: true },
      orderBy: { due_date: "asc" },
    });

    const firstBill = bills[0];
    const taxItem = firstBill.bill_item.find((i) =>
      i.description.startsWith("PPN ")
    );
    expect(taxItem).toBeDefined();
    expect(taxItem!.description).toBe("PPN 11%");
    // Tax = 11% of room fee (1,000,000) = 110,000. Deposit (500,000) excluded.
    expect(Number(taxItem!.amount)).toBe(110000);
    expect(taxItem!.related_id).toEqual({ tax: true });

    // The deposit item must still exist and NOT be part of the tax base.
    const depositItem = firstBill.bill_item.find(
      (i) => i.description === "Deposit"
    );
    expect(depositItem).toBeDefined();
    expect(Number(depositItem!.amount)).toBe(500000);
  });

  it("does not create a tax item when tax_rate is 0", async () => {
    // Default seeded system policy has tax_rate 0.
    const tenant = await testPrisma.tenant.create({
      data: { name: "NoTax Tenant", id_number: "nt-1", email: "nt1@test.com" },
    });

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
    const bills = await testPrisma.bill.findMany({
      where: { booking_id: booking!.id },
      include: { bill_item: true },
    });

    const taxItems = bills.flatMap((b) =>
      b.bill_item.filter((i) => i.description.startsWith("PPN "))
    );
    expect(taxItems).toHaveLength(0);
  });

  it("recomputes tax on the prorated subtotal at end of stay", async () => {
    await setSystemTaxRate(11);

    const tenant = await testPrisma.tenant.create({
      data: { name: "EndTax Tenant", id_number: "et-1", email: "et1@test.com" },
    });

    // Fee 3,100,000, Jan has 31 days. End Jan 15 -> ratio 15/31.
    await upsertBookingAction({
      room_id: 2,
      start_date: new Date("2025-01-01"),
      duration_id: null,
      fee: 3100000,
      tenant_id: tenant.id,
      is_rolling: true,
      status_id: 2,
    });

    const booking = await testPrisma.booking.findFirst({
      where: { tenant_id: tenant.id },
    });

    await scheduleEndOfStayAction(booking!.id, new Date("2025-01-15"));

    const bills = await testPrisma.bill.findMany({
      where: { booking_id: booking!.id },
      include: { bill_item: true },
    });
    expect(bills).toHaveLength(1);

    const roomItem = bills[0].bill_item.find(
      (i) => i.description === "Biaya Sewa"
    );
    // Prorated room fee: round(3,100,000 * 15/31) = 1,500,000
    expect(Number(roomItem!.amount)).toBe(1500000);

    const taxItem = bills[0].bill_item.find((i) =>
      i.description.startsWith("PPN ")
    );
    expect(taxItem).toBeDefined();
    // Tax recomputed on prorated subtotal: round(1,500,000 * 11%) = 165,000.
    // (NOT 11% of full 3,100,000 = 341,000.)
    expect(Number(taxItem!.amount)).toBe(165000);
  });
});
