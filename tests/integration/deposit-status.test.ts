import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import {
  updateDepositStatusAction,
  updateDepositAmountAction,
} from "@/app/(internal)/(dashboard_layout)/deposits/deposit-action";

describe("Deposit Status Machine", () => {
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

  async function createBookingWithDeposit(
    roomId: number,
    tenantId: string,
    depositAmount: number,
    depositStatus: "UNPAID" | "HELD" = "HELD"
  ) {
    const booking = await testPrisma.booking.create({
      data: {
        room_id: roomId,
        start_date: new Date("2025-01-01"),
        end_date: new Date("2025-06-30"),
        fee: 3000000,
        tenant_id: tenantId,
        is_rolling: false,
      },
    });

    const deposit = await testPrisma.deposit.create({
      data: {
        booking_id: booking.id,
        amount: depositAmount,
        status: depositStatus,
      },
    });

    return { booking, deposit };
  }

  describe("HELD -> APPLIED", () => {
    it("should set applied_at and not create a transaction", async () => {
      const { room, tenant } = await createBaseData();
      const { deposit } = await createBookingWithDeposit(
        room.id,
        tenant.id,
        5000000,
        "HELD"
      );

      const result = await updateDepositStatusAction({
        deposit_id: deposit.id,
        status: "APPLIED",
      });

      expect(result.success).toBe(true);

      const updated = await testPrisma.deposit.findUnique({
        where: { id: deposit.id },
      });
      expect(updated!.status).toBe("APPLIED");
      expect(updated!.applied_at).not.toBeNull();

      // No transaction should be created
      const transactions = await testPrisma.transaction.findMany({
        where: {
          related_id: { path: ["deposit_id"], equals: deposit.id },
        },
      });
      expect(transactions).toHaveLength(0);
    });
  });

  describe("HELD -> REFUNDED", () => {
    it("should create an EXPENSE transaction for full amount", async () => {
      const { room, tenant, location } = await createBaseData();
      const { deposit } = await createBookingWithDeposit(
        room.id,
        tenant.id,
        5000000,
        "HELD"
      );

      const result = await updateDepositStatusAction({
        deposit_id: deposit.id,
        status: "REFUNDED",
        refunded_amount: 5000000,
      });

      expect(result.success).toBe(true);

      const updated = await testPrisma.deposit.findUnique({
        where: { id: deposit.id },
      });
      expect(updated!.status).toBe("REFUNDED");
      expect(updated!.refunded_at).not.toBeNull();
      expect(Number(updated!.refunded_amount)).toBe(5000000);

      // EXPENSE transaction should be created
      const transactions = await testPrisma.transaction.findMany({
        where: {
          related_id: { path: ["deposit_id"], equals: deposit.id },
        },
      });
      expect(transactions).toHaveLength(1);
      expect(transactions[0].type).toBe("EXPENSE");
      expect(Number(transactions[0].amount)).toBe(5000000);
      expect(transactions[0].location_id).toBe(location.id);
    });
  });

  describe("HELD -> PARTIALLY_REFUNDED", () => {
    it("should create EXPENSE transaction for partial amount", async () => {
      const { room, tenant, location } = await createBaseData();
      const { deposit } = await createBookingWithDeposit(
        room.id,
        tenant.id,
        5000000,
        "HELD"
      );

      const result = await updateDepositStatusAction({
        deposit_id: deposit.id,
        status: "PARTIALLY_REFUNDED",
        refunded_amount: 2000000,
      });

      expect(result.success).toBe(true);

      const updated = await testPrisma.deposit.findUnique({
        where: { id: deposit.id },
      });
      expect(updated!.status).toBe("PARTIALLY_REFUNDED");
      expect(Number(updated!.refunded_amount)).toBe(2000000);

      const transactions = await testPrisma.transaction.findMany({
        where: {
          related_id: { path: ["deposit_id"], equals: deposit.id },
        },
      });
      expect(transactions).toHaveLength(1);
      expect(transactions[0].type).toBe("EXPENSE");
      expect(Number(transactions[0].amount)).toBe(2000000);
    });
  });

  describe("HELD -> FORFEITED", () => {
    it("should update status without creating a transaction", async () => {
      const { room, tenant } = await createBaseData();
      const { deposit } = await createBookingWithDeposit(
        room.id,
        tenant.id,
        5000000,
        "HELD"
      );

      const result = await updateDepositStatusAction({
        deposit_id: deposit.id,
        status: "FORFEITED",
      });

      expect(result.success).toBe(true);

      const updated = await testPrisma.deposit.findUnique({
        where: { id: deposit.id },
      });
      expect(updated!.status).toBe("FORFEITED");

      // No transaction should be created for FORFEITED
      const transactions = await testPrisma.transaction.findMany({
        where: {
          related_id: { path: ["deposit_id"], equals: deposit.id },
        },
      });
      expect(transactions).toHaveLength(0);
    });
  });

  describe("Invalid transitions", () => {
    it("should reject transition from UNPAID", async () => {
      const { room, tenant } = await createBaseData();
      const { deposit } = await createBookingWithDeposit(
        room.id,
        tenant.id,
        5000000,
        "UNPAID"
      );

      const result = await updateDepositStatusAction({
        deposit_id: deposit.id,
        status: "APPLIED",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("HELD");

      // Status should remain UNPAID
      const unchanged = await testPrisma.deposit.findUnique({
        where: { id: deposit.id },
      });
      expect(unchanged!.status).toBe("UNPAID");
    });

    it("should reject APPLIED transition from REFUNDED", async () => {
      const { room, tenant } = await createBaseData();
      const { deposit } = await createBookingWithDeposit(
        room.id,
        tenant.id,
        5000000,
        "HELD"
      );

      // First transition to REFUNDED
      await testPrisma.deposit.update({
        where: { id: deposit.id },
        data: { status: "REFUNDED" },
      });

      const result = await updateDepositStatusAction({
        deposit_id: deposit.id,
        status: "APPLIED",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("HELD");
    });
  });

  describe("Refund validation", () => {
    it("should reject full refund if amount does not equal deposit", async () => {
      const { room, tenant } = await createBaseData();
      const { deposit } = await createBookingWithDeposit(
        room.id,
        tenant.id,
        5000000,
        "HELD"
      );

      const result = await updateDepositStatusAction({
        deposit_id: deposit.id,
        status: "REFUNDED",
        refunded_amount: 3000000, // Not equal to 5M
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("equal deposit amount");
    });

    it("should reject partial refund if amount >= deposit", async () => {
      const { room, tenant } = await createBaseData();
      const { deposit } = await createBookingWithDeposit(
        room.id,
        tenant.id,
        5000000,
        "HELD"
      );

      const result = await updateDepositStatusAction({
        deposit_id: deposit.id,
        status: "PARTIALLY_REFUNDED",
        refunded_amount: 5000000, // Must be LESS than deposit
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("less than deposit amount");
    });

    it("should reject refund with zero amount", async () => {
      const { room, tenant } = await createBaseData();
      const { deposit } = await createBookingWithDeposit(
        room.id,
        tenant.id,
        5000000,
        "HELD"
      );

      const result = await updateDepositStatusAction({
        deposit_id: deposit.id,
        status: "REFUNDED",
        refunded_amount: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Refunded amount required");
    });
  });

  describe("updateDepositAmountAction", () => {
    it("should update deposit amount", async () => {
      const { room, tenant } = await createBaseData();
      const { deposit } = await createBookingWithDeposit(
        room.id,
        tenant.id,
        5000000,
        "UNPAID"
      );

      const result = await updateDepositAmountAction(deposit.id, 7000000);

      expect(result.success).toBe(true);

      const updated = await testPrisma.deposit.findUnique({
        where: { id: deposit.id },
      });
      expect(Number(updated!.amount)).toBe(7000000);
    });

    it("should reject non-positive amount", async () => {
      const { room, tenant } = await createBaseData();
      const { deposit } = await createBookingWithDeposit(
        room.id,
        tenant.id,
        5000000,
        "UNPAID"
      );

      const result = await updateDepositAmountAction(deposit.id, 0);
      expect(result.success).toBe(false);

      const result2 = await updateDepositAmountAction(deposit.id, -100);
      expect(result2.success).toBe(false);
    });
  });
});
