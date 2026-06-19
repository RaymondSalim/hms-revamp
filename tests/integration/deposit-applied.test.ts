import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { updateDepositStatusAction } from "@/app/(internal)/(dashboard_layout)/deposits/deposit-action";

describe("Deposit APPLIED Creates Bill Credit (BL-009)", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it("should create a negative bill item on the latest bill when deposit is applied", async () => {
    const location = await testPrisma.location.create({
      data: { name: "Loc", address: "Addr" },
    });
    const roomType = await testPrisma.roomType.create({
      data: { type: `Type-${Date.now()}` },
    });
    const room = await testPrisma.room.create({
      data: {
        room_number: `R-${Date.now()}`,
        room_type_id: roomType.id,
        status_id: 1,
        location_id: location.id,
      },
    });
    const tenant = await testPrisma.tenant.create({
      data: { name: "Tenant", id_number: "666", email: "d@test.com" },
    });

    const booking = await testPrisma.booking.create({
      data: {
        room_id: room.id,
        start_date: new Date("2025-01-01"),
        end_date: new Date("2025-03-31"),
        fee: 3000000,
        tenant_id: tenant.id,
        is_rolling: false,
      },
    });

    const deposit = await testPrisma.deposit.create({
      data: {
        booking_id: booking.id,
        amount: 1000000,
        status: "HELD",
      },
    });

    // Create the last bill (March)
    const lastBill = await testPrisma.bill.create({
      data: {
        booking_id: booking.id,
        description: "Tagihan Bulan 3",
        due_date: new Date("2025-03-31"),
      },
    });

    await testPrisma.billItem.create({
      data: {
        bill_id: lastBill.id,
        description: "Biaya Sewa",
        amount: 3000000,
        type: "GENERATED",
      },
    });

    // Apply deposit
    const result = await updateDepositStatusAction({
      deposit_id: deposit.id,
      status: "APPLIED",
    });

    expect(result.success).toBe(true);

    // Should have created a credit (negative) bill item on the latest bill
    const billItems = await testPrisma.billItem.findMany({
      where: { bill_id: lastBill.id },
      orderBy: { createdAt: "desc" },
    });

    const creditItem = billItems.find(
      (i) => i.description === "Potongan Deposit"
    );
    expect(creditItem).toBeDefined();
    expect(Number(creditItem!.amount)).toBe(-1000000);
    expect(creditItem!.type).toBe("CREATED");
  });
});
