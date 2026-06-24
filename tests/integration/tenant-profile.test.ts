import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import { getTenantProfile } from "@/app/_db/tenant";

describe("getTenantProfile", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it("returns tenant with bookings, bills, payments, deposits, and notes", async () => {
    const tenant = await testPrisma.tenant.create({
      data: { name: "Test Tenant", id_number: "123456" },
    });

    const room = await testPrisma.room.findFirst({ where: { id: 1 } });
    const booking = await testPrisma.booking.create({
      data: {
        room_id: room!.id,
        start_date: new Date("2026-01-01"),
        end_date: new Date("2026-06-30"),
        fee: 5000000,
        tenant_id: tenant.id,
        status_id: 2,
      },
    });

    await testPrisma.deposit.create({
      data: { booking_id: booking.id, amount: 5000000, status: "HELD" },
    });

    const bill = await testPrisma.bill.create({
      data: {
        booking_id: booking.id,
        description: "Sewa Januari",
        due_date: new Date("2026-01-01"),
        bill_item: { create: { description: "Sewa", amount: 5000000, type: "GENERATED" } },
      },
      include: { bill_item: true },
    });

    const payment = await testPrisma.payment.create({
      data: {
        booking_id: booking.id,
        amount: 5000000,
        payment_date: new Date("2026-01-05"),
        status_id: 2,
        payment_method: "BANK_TRANSFER",
      },
    });

    await testPrisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill.id, amount: 5000000 },
    });

    const siteUser = await testPrisma.siteUser.create({
      data: { name: "Staff", email: "staff-test@test.com", password: "hash" },
    });

    await testPrisma.note.create({
      data: { content: "Test note", tenant_id: tenant.id, created_by: siteUser.id },
    });

    const profile = await getTenantProfile(tenant.id);

    expect(profile).not.toBeNull();
    expect(profile!.name).toBe("Test Tenant");
    expect(profile!.bookings).toHaveLength(1);
    expect(profile!.bookings[0].deposit).not.toBeNull();
    expect(profile!.bookings[0].deposit!.status).toBe("HELD");
    expect(profile!.bookings[0].bills).toHaveLength(1);
    expect(profile!.bookings[0].bills[0].bill_item).toHaveLength(1);
    expect(profile!.bookings[0].bills[0].paymentBills).toHaveLength(1);
    expect(profile!.bookings[0].payments).toHaveLength(1);
    expect(profile!.notes).toHaveLength(1);
    expect(profile!.notes[0].content).toBe("Test note");
    expect(profile!.notes[0].author.name).toBe("Staff");
  });

  it("excludes soft-deleted bookings, bills, and payments", async () => {
    const tenant = await testPrisma.tenant.create({
      data: { name: "Del Tenant", id_number: "999" },
    });

    await testPrisma.booking.create({
      data: {
        room_id: 1,
        start_date: new Date("2026-01-01"),
        fee: 3000000,
        tenant_id: tenant.id,
        status_id: 2,
        deletedAt: new Date(),
      },
    });

    const profile = await getTenantProfile(tenant.id);
    expect(profile!.bookings).toHaveLength(0);
  });

  it("returns null for non-existent tenant", async () => {
    const profile = await getTenantProfile("non-existent-id");
    expect(profile).toBeNull();
  });
});
