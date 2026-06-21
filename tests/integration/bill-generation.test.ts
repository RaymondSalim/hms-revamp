import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import {
  generateBillsForFixedBooking,
  generateInitialBillsForRollingBooking,
  generateNextMonthlyBill,
} from "@/app/(internal)/(dashboard_layout)/bookings/booking-action";

describe("Bill Generation", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  // Helper to create the minimum references needed for a booking
  async function createBaseData() {
    const location = await testPrisma.location.create({
      data: { name: "Test Location", address: "Test Address" },
    });

    const roomType = await testPrisma.roomType.create({
      data: { type: `Standard-${Date.now()}` },
    });

    const roomStatus = await testPrisma.roomStatus.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, status: "AVAILABLE" },
    });

    const room = await testPrisma.room.create({
      data: {
        room_number: `R-${Date.now()}`,
        room_type_id: roomType.id,
        status_id: roomStatus.id,
        location_id: location.id,
      },
    });

    const tenant = await testPrisma.tenant.create({
      data: {
        name: "Test Tenant",
        id_number: "1234567890",
        email: "test@example.com",
      },
    });

    return { location, room, tenant };
  }

  describe("Fixed booking bill generation", () => {
    it("should generate 6 bills for a 6-month booking starting Jan 1", async () => {
      const { room, tenant } = await createBaseData();

      // Create a booking: Jan 1 to Jun 30 (6 months, starting on 1st)
      const booking = await testPrisma.booking.create({
        data: {
          room_id: room.id,
          start_date: new Date("2025-01-01"),
          end_date: new Date("2025-06-30"),
          fee: 3000000,
          tenant_id: tenant.id,
          is_rolling: false,
        },
      });

      const bills = await generateBillsForFixedBooking({
        id: booking.id,
        start_date: new Date("2025-01-01"),
        fee: 3000000,
        second_resident_fee: null,
        deposit: null,
        addOns: [],
        end_date: new Date("2025-06-30"),
      });

      expect(bills).toHaveLength(6);

      // Verify each bill has a "Biaya Sewa" item of 3M
      for (const bill of bills) {
        const items = await testPrisma.billItem.findMany({
          where: { bill_id: bill.id },
        });
        const roomFeeItem = items.find((i) => i.description === "Biaya Sewa");
        expect(roomFeeItem).toBeDefined();
        expect(Number(roomFeeItem!.amount)).toBe(3000000);
      }

      // Verify due dates are last day of each month
      const dbBills = await testPrisma.bill.findMany({
        where: { booking_id: booking.id },
        orderBy: { due_date: "asc" },
      });

      expect(dbBills[0].due_date).toEqual(new Date("2025-01-31"));
      expect(dbBills[1].due_date).toEqual(new Date("2025-02-28"));
      expect(dbBills[2].due_date).toEqual(new Date("2025-03-31"));
      expect(dbBills[3].due_date).toEqual(new Date("2025-04-30"));
      expect(dbBills[4].due_date).toEqual(new Date("2025-05-31"));
      expect(dbBills[5].due_date).toEqual(new Date("2025-06-30"));
    });

    it("should prorate first month when booking starts mid-month", async () => {
      const { room, tenant } = await createBaseData();

      // Booking starting Jan 15, fee=3M
      // Proration: (31 - 15 + 1) / 31 * 3M = 17/31 * 3M
      const booking = await testPrisma.booking.create({
        data: {
          room_id: room.id,
          start_date: new Date("2025-01-15"),
          end_date: new Date("2025-07-31"), // Non-1st start gets extra month
          fee: 3000000,
          tenant_id: tenant.id,
          is_rolling: false,
        },
      });

      await generateBillsForFixedBooking({
        id: booking.id,
        start_date: new Date("2025-01-15"),
        fee: 3000000,
        second_resident_fee: null,
        deposit: null,
        addOns: [],
        end_date: new Date("2025-07-31"),
      });

      const firstBill = await testPrisma.bill.findFirst({
        where: { booking_id: booking.id },
        orderBy: { due_date: "asc" },
        include: { bill_item: true },
      });

      const roomFeeItem = firstBill!.bill_item.find(
        (i) => i.description === "Biaya Sewa"
      );
      const expectedProrated = (17 / 31) * 3000000;
      expect(Number(roomFeeItem!.amount)).toBeCloseTo(expectedProrated, 0);
    });

    it("should escalate rent after the configured frequency", async () => {
      const { room, tenant } = await createBaseData();

      // Booking spanning 13 months starting on the 1st (no proration).
      const booking = await testPrisma.booking.create({
        data: {
          room_id: room.id,
          start_date: new Date("2025-01-01"),
          end_date: new Date("2026-01-31"),
          fee: 1000000,
          tenant_id: tenant.id,
          is_rolling: false,
        },
      });

      // Booking-level policy: +10% every 12 months.
      await testPrisma.billingPolicy.create({
        data: {
          booking_id: booking.id,
          proration_method: "daily",
          rate_escalation_percentage: 10,
          rate_escalation_frequency: 12,
        },
      });

      await generateBillsForFixedBooking({
        id: booking.id,
        start_date: new Date("2025-01-01"),
        fee: 1000000,
        second_resident_fee: null,
        deposit: null,
        addOns: [],
        end_date: new Date("2026-01-31"),
      });

      const dbBills = await testPrisma.bill.findMany({
        where: { booking_id: booking.id },
        orderBy: { due_date: "asc" },
        include: { bill_item: true },
      });

      const roomFee = (billIndex: number) =>
        Number(
          dbBills[billIndex].bill_item.find(
            (i) => i.description === "Biaya Sewa"
          )!.amount
        );

      // Months 0..11 stay at base; month 12 (the 13th bill) steps to +10%.
      expect(roomFee(0)).toBe(1000000);
      expect(roomFee(11)).toBe(1000000);
      expect(roomFee(12)).toBe(1100000);
    });

    it("should include deposit in first bill", async () => {
      const { room, tenant } = await createBaseData();

      const booking = await testPrisma.booking.create({
        data: {
          room_id: room.id,
          start_date: new Date("2025-01-01"),
          end_date: new Date("2025-06-30"),
          fee: 3000000,
          tenant_id: tenant.id,
          is_rolling: false,
        },
      });

      const deposit = await testPrisma.deposit.create({
        data: {
          booking_id: booking.id,
          amount: 5000000,
          status: "UNPAID",
        },
      });

      await generateBillsForFixedBooking({
        id: booking.id,
        start_date: new Date("2025-01-01"),
        fee: 3000000,
        second_resident_fee: null,
        deposit: { id: deposit.id, amount: 5000000 },
        addOns: [],
        end_date: new Date("2025-06-30"),
      });

      const firstBill = await testPrisma.bill.findFirst({
        where: { booking_id: booking.id },
        orderBy: { due_date: "asc" },
        include: { bill_item: true },
      });

      const depositItem = firstBill!.bill_item.find(
        (i) => i.description === "Deposit"
      );
      const roomFeeItem = firstBill!.bill_item.find(
        (i) => i.description === "Biaya Sewa"
      );

      expect(depositItem).toBeDefined();
      expect(Number(depositItem!.amount)).toBe(5000000);
      expect(roomFeeItem).toBeDefined();
      expect(Number(roomFeeItem!.amount)).toBe(3000000);

      // Second bill should NOT have deposit
      const allBills = await testPrisma.bill.findMany({
        where: { booking_id: booking.id },
        orderBy: { due_date: "asc" },
        include: { bill_item: true },
      });
      const secondBillDeposit = allBills[1].bill_item.find(
        (i) => i.description === "Deposit"
      );
      expect(secondBillDeposit).toBeUndefined();
    });

    it("should include second resident fee in each bill", async () => {
      const { room, tenant } = await createBaseData();

      const booking = await testPrisma.booking.create({
        data: {
          room_id: room.id,
          start_date: new Date("2025-01-01"),
          end_date: new Date("2025-03-31"),
          fee: 3000000,
          tenant_id: tenant.id,
          is_rolling: false,
          second_resident_fee: 500000,
        },
      });

      await generateBillsForFixedBooking({
        id: booking.id,
        start_date: new Date("2025-01-01"),
        fee: 3000000,
        second_resident_fee: 500000,
        deposit: null,
        addOns: [],
        end_date: new Date("2025-03-31"),
      });

      const bills = await testPrisma.bill.findMany({
        where: { booking_id: booking.id },
        orderBy: { due_date: "asc" },
        include: { bill_item: true },
      });

      expect(bills).toHaveLength(3);

      for (const bill of bills) {
        const srItem = bill.bill_item.find(
          (i) => i.description === "Biaya Penghuni Kedua"
        );
        expect(srItem).toBeDefined();
        expect(Number(srItem!.amount)).toBe(500000);
      }
    });

    it("should apply tiered addon pricing per month", async () => {
      const { room, tenant, location } = await createBaseData();

      // Create addon with tiered pricing:
      // Months 0-2: 200K, Months 3+: 150K
      const addon = await testPrisma.addOn.create({
        data: {
          name: `WiFi-${Date.now()}`,
          location_id: location.id,
          pricing: {
            create: [
              {
                interval_start: 0,
                interval_end: 2,
                price: 200000,
                is_full_payment: false,
              },
              {
                interval_start: 3,
                interval_end: null,
                price: 150000,
                is_full_payment: false,
              },
            ],
          },
        },
        include: { pricing: true },
      });

      const booking = await testPrisma.booking.create({
        data: {
          room_id: room.id,
          start_date: new Date("2025-01-01"),
          end_date: new Date("2025-05-31"),
          fee: 3000000,
          tenant_id: tenant.id,
          is_rolling: false,
        },
      });

      const bookingAddon = await testPrisma.bookingAddOn.create({
        data: {
          booking_id: booking.id,
          addon_id: addon.id,
          start_date: new Date("2025-01-01"),
          is_rolling: false,
        },
      });

      await generateBillsForFixedBooking({
        id: booking.id,
        start_date: new Date("2025-01-01"),
        fee: 3000000,
        second_resident_fee: null,
        deposit: null,
        addOns: [
          {
            start_date: new Date("2025-01-01"),
            end_date: null,
            addOn: {
              pricing: addon.pricing.map((p) => ({
                interval_start: p.interval_start,
                interval_end: p.interval_end,
                price: Number(p.price),
                is_full_payment: p.is_full_payment,
              })),
            },
          },
        ],
        end_date: new Date("2025-05-31"),
      });

      const bills = await testPrisma.bill.findMany({
        where: { booking_id: booking.id },
        orderBy: { due_date: "asc" },
        include: { bill_item: true },
      });

      expect(bills).toHaveLength(5);

      // Months 0, 1, 2 (Jan, Feb, Mar) should have addon = 200K
      for (let i = 0; i < 3; i++) {
        const addonItem = bills[i].bill_item.find(
          (item) => item.description === "Add-on"
        );
        expect(addonItem).toBeDefined();
        expect(Number(addonItem!.amount)).toBe(200000);
      }

      // Months 3, 4 (Apr, May) should have addon = 150K
      for (let i = 3; i < 5; i++) {
        const addonItem = bills[i].bill_item.find(
          (item) => item.description === "Add-on"
        );
        expect(addonItem).toBeDefined();
        expect(Number(addonItem!.amount)).toBe(150000);
      }
    });
  });

  describe("Rolling booking bill generation", () => {
    it("should generate initial bills and allow next monthly bill", async () => {
      const { room, tenant } = await createBaseData();

      const booking = await testPrisma.booking.create({
        data: {
          room_id: room.id,
          start_date: new Date("2025-01-01"),
          fee: 3000000,
          tenant_id: tenant.id,
          is_rolling: true,
          end_date: null,
        },
      });

      // Generate initial bills (up to current month)
      await generateInitialBillsForRollingBooking({
        id: booking.id,
        start_date: new Date("2025-01-01"),
        fee: 3000000,
        second_resident_fee: null,
        deposit: null,
        addOns: [],
      });

      const initialBills = await testPrisma.bill.findMany({
        where: { booking_id: booking.id },
      });
      expect(initialBills.length).toBeGreaterThan(0);

      // Generate next monthly bill (simulate next month)
      const nextMonth = new Date("2030-02-01"); // Far future to ensure it's after initial bills
      const newBill = await generateNextMonthlyBill(
        {
          id: booking.id,
          start_date: new Date("2025-01-01"),
          fee: 3000000,
          second_resident_fee: null,
          addOns: [],
          is_rolling: true,
          end_date: null,
        },
        nextMonth
      );

      expect(newBill).not.toBeNull();

      // Call again (idempotent) -- should return null
      const duplicateBill = await generateNextMonthlyBill(
        {
          id: booking.id,
          start_date: new Date("2025-01-01"),
          fee: 3000000,
          second_resident_fee: null,
          addOns: [],
          is_rolling: true,
          end_date: null,
        },
        nextMonth
      );

      expect(duplicateBill).toBeNull();
    });

    it("creates no duplicate bill rows when monthly billing re-runs for the same period (idempotency regression)", async () => {
      const { room, tenant } = await createBaseData();

      const booking = await testPrisma.booking.create({
        data: {
          room_id: room.id,
          start_date: new Date("2025-01-01"),
          fee: 3000000,
          tenant_id: tenant.id,
          is_rolling: true,
          end_date: null,
        },
      });

      const bookingArg = {
        id: booking.id,
        start_date: new Date("2025-01-01"),
        fee: 3000000,
        second_resident_fee: null,
        addOns: [],
        is_rolling: true,
        end_date: null,
      };
      const targetDate = new Date("2030-03-01");

      // Simulate the cron firing three times for the same period (e.g. a
      // platform retry after a timeout). Only the first run should persist a
      // bill; the row count for that due date must never exceed one.
      await generateNextMonthlyBill(bookingArg, targetDate);
      await generateNextMonthlyBill(bookingArg, targetDate);
      await generateNextMonthlyBill(bookingArg, targetDate);

      const dueDate = new Date(Date.UTC(2030, 2, 31)); // last day of Mar 2030
      const billsForPeriod = await testPrisma.bill.findMany({
        where: { booking_id: booking.id, due_date: dueDate },
      });

      expect(billsForPeriod).toHaveLength(1);
    });

    it("should not generate bill for non-rolling booking", async () => {
      const { room, tenant } = await createBaseData();

      const booking = await testPrisma.booking.create({
        data: {
          room_id: room.id,
          start_date: new Date("2025-01-01"),
          end_date: new Date("2025-06-30"),
          fee: 3000000,
          tenant_id: tenant.id,
          is_rolling: false,
        },
      });

      const result = await generateNextMonthlyBill(
        {
          id: booking.id,
          start_date: new Date("2025-01-01"),
          fee: 3000000,
          second_resident_fee: null,
          addOns: [],
          is_rolling: false,
          end_date: new Date("2025-06-30"),
        },
        new Date("2025-07-01")
      );

      expect(result).toBeNull();
    });
  });
});
