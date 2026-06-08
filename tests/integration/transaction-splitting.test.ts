import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { createOrUpdatePaymentTransactions } from "@/app/(internal)/(dashboard_layout)/payments/payment-action";
import { generatePaymentBillMappingFromPaymentsAndBills } from "@/app/(internal)/(dashboard_layout)/bills/bill-action";

describe("Transaction Splitting (BL-005)", () => {
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

  describe("Pure room payment", () => {
    it("should create single Biaya Sewa INCOME transaction", async () => {
      const { room, tenant, location } = await createBaseData();

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

      const payment = await testPrisma.payment.create({
        data: {
          booking_id: booking.id,
          amount: 3000000,
          payment_date: new Date("2025-01-05"),
        },
      });

      // Create payment-bill mapping
      await testPrisma.paymentBill.create({
        data: {
          payment_id: payment.id,
          bill_id: bill.id,
          amount: 3000000,
        },
      });

      await createOrUpdatePaymentTransactions(payment.id);

      const transactions = await testPrisma.transaction.findMany({
        where: {
          related_id: { path: ["payment_id"], equals: payment.id },
        },
      });

      expect(transactions).toHaveLength(1);
      expect(transactions[0].type).toBe("INCOME");
      expect(transactions[0].description).toBe("Biaya Sewa");
      expect(Number(transactions[0].amount)).toBe(3000000);
      expect(transactions[0].location_id).toBe(location.id);
    });
  });

  describe("Deposit + room split", () => {
    it("should create two transactions: Deposit INCOME + Biaya Sewa INCOME", async () => {
      const { room, tenant, location } = await createBaseData();

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

      const bill = await testPrisma.bill.create({
        data: {
          booking_id: booking.id,
          description: "Tagihan Bulan 1",
          due_date: new Date("2025-01-31"),
        },
      });

      // Deposit item (1M)
      await testPrisma.billItem.create({
        data: {
          bill_id: bill.id,
          description: "Deposit",
          amount: 1000000,
          type: "GENERATED",
          related_id: { deposit_id: deposit.id },
        },
      });

      // Room fee item (3M)
      await testPrisma.billItem.create({
        data: {
          bill_id: bill.id,
          description: "Biaya Sewa",
          amount: 3000000,
          type: "GENERATED",
        },
      });

      // Payment covers full bill (4M)
      const payment = await testPrisma.payment.create({
        data: {
          booking_id: booking.id,
          amount: 4000000,
          payment_date: new Date("2025-01-05"),
        },
      });

      await testPrisma.paymentBill.create({
        data: {
          payment_id: payment.id,
          bill_id: bill.id,
          amount: 4000000,
        },
      });

      await createOrUpdatePaymentTransactions(payment.id);

      const transactions = await testPrisma.transaction.findMany({
        where: {
          related_id: { path: ["payment_id"], equals: payment.id },
        },
        orderBy: { description: "asc" },
      });

      expect(transactions).toHaveLength(2);

      const depositTx = transactions.find((t) => t.description === "Deposit");
      const roomTx = transactions.find((t) => t.description === "Biaya Sewa");

      expect(depositTx).toBeDefined();
      expect(depositTx!.type).toBe("INCOME");
      expect(Number(depositTx!.amount)).toBe(1000000);

      expect(roomTx).toBeDefined();
      expect(roomTx!.type).toBe("INCOME");
      expect(Number(roomTx!.amount)).toBe(3000000);
    });
  });

  describe("BL-006: Deposit status UNPAID -> HELD on payment", () => {
    it("should change deposit status to HELD when deposit transaction is created", async () => {
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

      // Payment covers deposit fully
      const payment = await testPrisma.payment.create({
        data: {
          booking_id: booking.id,
          amount: 1000000,
          payment_date: new Date("2025-01-05"),
        },
      });

      await testPrisma.paymentBill.create({
        data: {
          payment_id: payment.id,
          bill_id: bill.id,
          amount: 1000000,
        },
      });

      // Before: deposit is UNPAID
      const beforeDeposit = await testPrisma.deposit.findUnique({
        where: { id: deposit.id },
      });
      expect(beforeDeposit!.status).toBe("UNPAID");

      await createOrUpdatePaymentTransactions(payment.id);

      // After: deposit should be HELD
      const afterDeposit = await testPrisma.deposit.findUnique({
        where: { id: deposit.id },
      });
      expect(afterDeposit!.status).toBe("HELD");
    });
  });

  describe("BL-007: Deposit reverts to UNPAID when payment deleted", () => {
    it("should revert deposit to UNPAID when only deposit payment is removed", async () => {
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
          status: "HELD", // Already held from a previous payment
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

      // Payment that only covers room fee (no deposit portion)
      const payment = await testPrisma.payment.create({
        data: {
          booking_id: booking.id,
          amount: 3000000,
          payment_date: new Date("2025-01-05"),
        },
      });

      // Map the payment: payment pays room fee only (skipping deposit in allocation)
      await testPrisma.paymentBill.create({
        data: {
          payment_id: payment.id,
          bill_id: bill.id,
          amount: 3000000,
        },
      });

      // When we call createOrUpdatePaymentTransactions and NO deposit_id found
      // AND there are no existing deposit income transactions, it should revert
      await createOrUpdatePaymentTransactions(payment.id);

      const afterDeposit = await testPrisma.deposit.findUnique({
        where: { id: deposit.id },
      });

      // The deposit should revert to UNPAID since there are no deposit income transactions
      expect(afterDeposit!.status).toBe("UNPAID");
    });
  });

  describe("Idempotency", () => {
    it("should produce same result when called twice", async () => {
      const { room, tenant, location } = await createBaseData();

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

      const payment = await testPrisma.payment.create({
        data: {
          booking_id: booking.id,
          amount: 3000000,
          payment_date: new Date("2025-01-05"),
        },
      });

      await testPrisma.paymentBill.create({
        data: {
          payment_id: payment.id,
          bill_id: bill.id,
          amount: 3000000,
        },
      });

      // Call once
      await createOrUpdatePaymentTransactions(payment.id);

      const firstCallTx = await testPrisma.transaction.findMany({
        where: {
          related_id: { path: ["payment_id"], equals: payment.id },
        },
      });

      // Call again (idempotent)
      await createOrUpdatePaymentTransactions(payment.id);

      const secondCallTx = await testPrisma.transaction.findMany({
        where: {
          related_id: { path: ["payment_id"], equals: payment.id },
        },
      });

      // Should have same number of transactions and same amounts
      expect(secondCallTx).toHaveLength(firstCallTx.length);
      expect(secondCallTx).toHaveLength(1);
      expect(Number(secondCallTx[0].amount)).toBe(
        Number(firstCallTx[0].amount)
      );
      expect(secondCallTx[0].description).toBe(firstCallTx[0].description);
    });
  });
});
