import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { upsertBookingAction } from "@/app/(internal)/(dashboard_layout)/bookings/booking-action";
import {
  createMeterReadingAction,
  deleteMeterReadingAction,
} from "@/app/(internal)/(dashboard_layout)/utilities/utility-action";

describe("Utility billing via meter readings", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  async function createBooking() {
    const tenant = await testPrisma.tenant.create({
      data: {
        name: "Util Tenant",
        id_number: `util-${Date.now()}`,
        email: `util-${Date.now()}@test.com`,
      },
    });

    await upsertBookingAction({
      room_id: 1,
      start_date: new Date("2025-01-01"),
      duration_id: 2, // 3 months -> generates bills
      fee: 1000000,
      tenant_id: tenant.id,
      is_rolling: false,
      status_id: 2,
    });

    const booking = await testPrisma.booking.findFirst({
      where: { tenant_id: tenant.id },
    });
    return booking!;
  }

  it("first reading establishes baseline: previous_value null, no bill item", async () => {
    const booking = await createBooking();

    const res = await createMeterReadingAction({
      booking_id: booking.id,
      utility_type: "electricity",
      reading_date: new Date("2025-01-05"),
      reading_value: 100,
      rate_per_unit: 1500,
    });
    expect(res.success).toBe(true);

    const readings = await testPrisma.meterReading.findMany({
      where: { booking_id: booking.id },
    });
    expect(readings).toHaveLength(1);
    expect(readings[0].previous_value).toBeNull();

    const utilityItems = await testPrisma.billItem.findMany({
      where: {
        bill: { booking_id: booking.id },
        related_id: { path: ["utility"], equals: true },
      },
    });
    expect(utilityItems).toHaveLength(0);
  });

  it("second reading auto-fills previous_value and creates a bill item on latest bill", async () => {
    const booking = await createBooking();

    await createMeterReadingAction({
      booking_id: booking.id,
      utility_type: "electricity",
      reading_date: new Date("2025-01-05"),
      reading_value: 100,
      rate_per_unit: 1500,
    });

    const second = await createMeterReadingAction({
      booking_id: booking.id,
      utility_type: "electricity",
      reading_date: new Date("2025-02-05"),
      reading_value: 130,
      rate_per_unit: 1500,
    });
    expect(second.success).toBe(true);

    const reading = await testPrisma.meterReading.findFirst({
      where: { booking_id: booking.id, reading_value: 130 },
    });
    expect(Number(reading!.previous_value)).toBe(100);

    // Latest bill by due_date should carry the charge.
    const latestBill = await testPrisma.bill.findFirst({
      where: { booking_id: booking.id },
      orderBy: { due_date: "desc" },
    });
    const items = await testPrisma.billItem.findMany({
      where: { bill_id: latestBill!.id },
    });
    const utilityItem = items.find(
      (i) => i.description === "Pemakaian Listrik"
    );
    expect(utilityItem).toBeDefined();
    // (130 - 100) * 1500 = 45000
    expect(Number(utilityItem!.amount)).toBe(45000);
    expect(
      (utilityItem!.related_id as { meter_reading_id: number }).meter_reading_id
    ).toBe(reading!.id);
  });

  it("clamps consumption: reading below previous yields amount 0", async () => {
    const booking = await createBooking();

    await createMeterReadingAction({
      booking_id: booking.id,
      utility_type: "water",
      reading_date: new Date("2025-01-05"),
      reading_value: 500,
      rate_per_unit: 2000,
    });

    await createMeterReadingAction({
      booking_id: booking.id,
      utility_type: "water",
      reading_date: new Date("2025-02-05"),
      reading_value: 480, // meter reset / error
      rate_per_unit: 2000,
    });

    const items = await testPrisma.billItem.findMany({
      where: {
        bill: { booking_id: booking.id },
        related_id: { path: ["utility"], equals: true },
      },
    });
    expect(items).toHaveLength(1);
    expect(Number(items[0].amount)).toBe(0);
  });

  it("tracks utility types independently", async () => {
    const booking = await createBooking();

    // Electricity baseline + water baseline
    await createMeterReadingAction({
      booking_id: booking.id,
      utility_type: "electricity",
      reading_date: new Date("2025-01-05"),
      reading_value: 100,
      rate_per_unit: 1500,
    });
    await createMeterReadingAction({
      booking_id: booking.id,
      utility_type: "water",
      reading_date: new Date("2025-01-06"),
      reading_value: 9000,
      rate_per_unit: 50,
    });

    // Second water reading must use the prior WATER value (9000), not electricity.
    const res = await createMeterReadingAction({
      booking_id: booking.id,
      utility_type: "water",
      reading_date: new Date("2025-02-06"),
      reading_value: 9010,
      rate_per_unit: 50,
    });
    expect(res.success).toBe(true);

    const reading = await testPrisma.meterReading.findFirst({
      where: { booking_id: booking.id, utility_type: "water", reading_value: 9010 },
    });
    expect(Number(reading!.previous_value)).toBe(9000);

    const waterItem = await testPrisma.billItem.findFirst({
      where: {
        bill: { booking_id: booking.id },
        description: "Pemakaian Air",
      },
    });
    // (9010 - 9000) * 50 = 500
    expect(Number(waterItem!.amount)).toBe(500);
  });

  it("delete removes the reading and its bill item", async () => {
    const booking = await createBooking();

    await createMeterReadingAction({
      booking_id: booking.id,
      utility_type: "electricity",
      reading_date: new Date("2025-01-05"),
      reading_value: 100,
      rate_per_unit: 1500,
    });
    await createMeterReadingAction({
      booking_id: booking.id,
      utility_type: "electricity",
      reading_date: new Date("2025-02-05"),
      reading_value: 130,
      rate_per_unit: 1500,
    });

    const reading = await testPrisma.meterReading.findFirst({
      where: { booking_id: booking.id, reading_value: 130 },
    });

    const del = await deleteMeterReadingAction(reading!.id);
    expect(del.success).toBe(true);

    const stillThere = await testPrisma.meterReading.findUnique({
      where: { id: reading!.id },
    });
    expect(stillThere).toBeNull();

    const items = await testPrisma.billItem.findMany({
      where: {
        bill: { booking_id: booking.id },
        related_id: { path: ["meter_reading_id"], equals: reading!.id },
      },
    });
    expect(items).toHaveLength(0);
  });
});
