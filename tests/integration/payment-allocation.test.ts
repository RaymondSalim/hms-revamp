import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { simulateUnpaidBillPaymentAction } from "@/app/(internal)/(dashboard_layout)/bills/bill-action";
import { generatePaymentBillMappingFromPaymentsAndBills } from "@/app/_lib/util/payment-allocation";

describe("Payment Auto-Allocation", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  async function createBaseData() {
    const location = await testPrisma.location.create({
      data: { name: "Test Location", address: "Test Address" },
    });

    const roomStatus = await testPrisma.roomStatus.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, status: "AVAILABLE" },
    });

    const roomType = await testPrisma.roomType.create({
      data: { type: `Standard-${Date.now()}` },
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

  async function createBookingWithBills(
    roomId: number,
    tenantId: string,
    billAmounts: number[]
  ) {
    const booking = await testPrisma.booking.create({
      data: {
        room_id: roomId,
        start_date: new Date("2025-01-01"),
        end_date: new Date("2025-12-31"),
        fee: billAmounts[0] ?? 1000000,
        tenant_id: tenantId,
        is_rolling: false,
      },
    });

    const bills = [];
    for (let i = 0; i < billAmounts.length; i++) {
      const bill = await testPrisma.bill.create({
        data: {
          booking_id: booking.id,
          description: `Tagihan Bulan ${i + 1}`,
          due_date: new Date(`2025-${String(i + 1).padStart(2, "0")}-28`),
        },
      });
      await testPrisma.billItem.create({
        data: {
          bill_id: bill.id,
          description: "Biaya Sewa",
          amount: billAmounts[i],
          type: "GENERATED",
        },
      });
      bills.push(bill);
    }

    return { booking, bills };
  }

  describe("BL-003: Auto-allocation simulation", () => {
    it("should allocate payment across bills in order", async () => {
      const { room, tenant } = await createBaseData();
      const { booking } = await createBookingWithBills(room.id, tenant.id, [
        1000000, 1000000, 1000000,
      ]);

      // Simulate a 2.5M payment across 3 bills of 1M each
      const allocations = await simulateUnpaidBillPaymentAction(
        booking.id,
        2500000
      );

      expect(allocations).toHaveLength(3);
      expect(allocations[0].amount).toBe(1000000); // First bill fully covered
      expect(allocations[1].amount).toBe(1000000); // Second bill fully covered
      expect(allocations[2].amount).toBe(500000); // Third bill gets remaining 500K
    });

    it("should fully allocate when payment matches total", async () => {
      const { room, tenant } = await createBaseData();
      const { booking } = await createBookingWithBills(room.id, tenant.id, [
        1000000, 1000000, 1000000,
      ]);

      const allocations = await simulateUnpaidBillPaymentAction(
        booking.id,
        3000000
      );

      expect(allocations).toHaveLength(3);
      expect(allocations[0].amount).toBe(1000000);
      expect(allocations[1].amount).toBe(1000000);
      expect(allocations[2].amount).toBe(1000000);
    });

    it("should handle overpayment (payment larger than total bills)", async () => {
      const { room, tenant } = await createBaseData();
      const { booking } = await createBookingWithBills(room.id, tenant.id, [
        1000000, 1000000,
      ]);

      // Payment of 3M for 2M total bills
      const allocations = await simulateUnpaidBillPaymentAction(
        booking.id,
        3000000
      );

      // Should only allocate up to total outstanding
      expect(allocations).toHaveLength(2);
      expect(allocations[0].amount).toBe(1000000);
      expect(allocations[1].amount).toBe(1000000);
    });

    it("should skip already-paid bills", async () => {
      const { room, tenant } = await createBaseData();
      const { booking, bills } = await createBookingWithBills(
        room.id,
        tenant.id,
        [1000000, 1000000, 1000000]
      );

      // Create a payment that already covers the first bill
      const payment = await testPrisma.payment.create({
        data: {
          booking_id: booking.id,
          amount: 1000000,
          payment_date: new Date("2025-01-15"),
        },
      });

      await testPrisma.paymentBill.create({
        data: {
          payment_id: payment.id,
          bill_id: bills[0].id,
          amount: 1000000,
        },
      });

      // Simulate another 1.5M payment
      const allocations = await simulateUnpaidBillPaymentAction(
        booking.id,
        1500000
      );

      // First bill is already paid, so allocations start from bill 2
      expect(allocations).toHaveLength(2);
      expect(allocations[0].bill_id).toBe(bills[1].id);
      expect(allocations[0].amount).toBe(1000000);
      expect(allocations[1].bill_id).toBe(bills[2].id);
      expect(allocations[1].amount).toBe(500000);
    });
  });

  describe("BL-014: Deterministic regeneration of payment-bill mappings", () => {
    it("should correctly remap after deleting first payment", async () => {
      const { room, tenant } = await createBaseData();
      const { booking, bills } = await createBookingWithBills(
        room.id,
        tenant.id,
        [1000000, 1000000, 1000000]
      );

      // Create two payments
      const payment1 = await testPrisma.payment.create({
        data: {
          booking_id: booking.id,
          amount: 1500000,
          payment_date: new Date("2025-01-10"),
        },
      });

      const payment2 = await testPrisma.payment.create({
        data: {
          booking_id: booking.id,
          amount: 1000000,
          payment_date: new Date("2025-01-20"),
        },
      });

      // Generate mappings
      await generatePaymentBillMappingFromPaymentsAndBills(booking.id);

      // Verify initial allocation:
      // Payment1 (1.5M): Bill1 gets 1M, Bill2 gets 500K
      // Payment2 (1M): Bill2 gets 500K, Bill3 gets 500K
      let mappings = await testPrisma.paymentBill.findMany({
        where: { payment_id: { in: [payment1.id, payment2.id] } },
        orderBy: [{ payment_id: "asc" }, { bill_id: "asc" }],
      });

      expect(mappings.filter((m) => m.payment_id === payment1.id)).toHaveLength(
        2
      );
      expect(
        Number(
          mappings.find(
            (m) => m.payment_id === payment1.id && m.bill_id === bills[0].id
          )?.amount
        )
      ).toBe(1000000);
      expect(
        Number(
          mappings.find(
            (m) => m.payment_id === payment1.id && m.bill_id === bills[1].id
          )?.amount
        )
      ).toBe(500000);

      // Delete payment1
      await testPrisma.paymentBill.deleteMany({
        where: { payment_id: payment1.id },
      });
      await testPrisma.payment.delete({ where: { id: payment1.id } });

      // Regenerate mappings
      await generatePaymentBillMappingFromPaymentsAndBills(booking.id);

      // Payment2 (1M) should now map to Bill1 only (since payment1 is gone)
      mappings = await testPrisma.paymentBill.findMany({
        where: { payment_id: payment2.id },
        orderBy: { bill_id: "asc" },
      });

      expect(mappings).toHaveLength(1);
      expect(mappings[0].bill_id).toBe(bills[0].id);
      expect(Number(mappings[0].amount)).toBe(1000000);
    });

    it("should handle payments summing exactly to total bills", async () => {
      const { room, tenant } = await createBaseData();
      const { booking, bills } = await createBookingWithBills(
        room.id,
        tenant.id,
        [1000000, 2000000]
      );

      const payment1 = await testPrisma.payment.create({
        data: {
          booking_id: booking.id,
          amount: 1500000,
          payment_date: new Date("2025-01-10"),
        },
      });

      const payment2 = await testPrisma.payment.create({
        data: {
          booking_id: booking.id,
          amount: 1500000,
          payment_date: new Date("2025-01-20"),
        },
      });

      await generatePaymentBillMappingFromPaymentsAndBills(booking.id);

      const mappings = await testPrisma.paymentBill.findMany({
        orderBy: [{ payment_id: "asc" }, { bill_id: "asc" }],
      });

      // Payment1 (1.5M): Bill1 gets 1M, Bill2 gets 500K
      const p1Mappings = mappings.filter(
        (m) => m.payment_id === payment1.id
      );
      expect(p1Mappings).toHaveLength(2);
      expect(Number(p1Mappings[0].amount)).toBe(1000000);
      expect(Number(p1Mappings[1].amount)).toBe(500000);

      // Payment2 (1.5M): Bill2 gets 1.5M (remaining of 2M - 500K already allocated)
      const p2Mappings = mappings.filter(
        (m) => m.payment_id === payment2.id
      );
      expect(p2Mappings).toHaveLength(1);
      expect(p2Mappings[0].bill_id).toBe(bills[1].id);
      expect(Number(p2Mappings[0].amount)).toBe(1500000);
    });
  });

  describe("Deposit-first priority in allocation", () => {
    it("should allocate to deposit item before room fee in bill", async () => {
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
          amount: 1000000,
          status: "UNPAID",
        },
      });

      // Create a bill with deposit (1M) + room fee (3M) = 4M total
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
          description: "Deposit",
          amount: 1000000,
          type: "GENERATED",
          related_id: { deposit_id: deposit.id },
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

      // Payment of 2M -- should allocate 2M to the bill
      const payment = await testPrisma.payment.create({
        data: {
          booking_id: booking.id,
          amount: 2000000,
          payment_date: new Date("2025-01-05"),
        },
      });

      await generatePaymentBillMappingFromPaymentsAndBills(booking.id);

      const mappings = await testPrisma.paymentBill.findMany({
        where: { payment_id: payment.id },
      });

      // Should have allocated 2M to the bill (total bill is 4M)
      expect(mappings).toHaveLength(1);
      expect(mappings[0].bill_id).toBe(bill.id);
      expect(Number(mappings[0].amount)).toBe(2000000);
    });
  });
});
