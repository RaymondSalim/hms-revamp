import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { deleteBookingAction } from "@/app/(internal)/(dashboard_layout)/bookings/booking-action";
import { deletePaymentAction } from "@/app/(internal)/(dashboard_layout)/payments/payment-action";
import { getBookingsByLocation, getBookingById } from "@/app/_db/bookings";
import { getRecentPayments } from "@/app/_db/dashboard";
import { getTransactionsByLocation } from "@/app/_db/transaction";

describe("Soft-delete excludes financial spine from reads", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  async function createFinancialBooking() {
    const location = await testPrisma.location.create({
      data: { name: "SD Location", address: "SD Address" },
    });
    const roomType = await testPrisma.roomType.create({
      data: { type: `SD-${Date.now()}` },
    });
    const roomStatus = await testPrisma.roomStatus.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, status: "AVAILABLE" },
    });
    const room = await testPrisma.room.create({
      data: {
        room_number: `SD-${Date.now()}`,
        room_type_id: roomType.id,
        status_id: roomStatus.id,
        location_id: location.id,
      },
    });
    const tenant = await testPrisma.tenant.create({
      data: { name: "SD Tenant", id_number: `${Date.now()}`, email: "sd@test.com" },
    });
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
        description: "Tagihan",
        due_date: new Date("2025-01-31"),
        bill_item: { create: { description: "Biaya Sewa", amount: 3000000 } },
      },
    });
    const payment = await testPrisma.payment.create({
      data: {
        booking_id: booking.id,
        amount: 3000000,
        payment_date: new Date("2025-01-05"),
      },
    });
    const transaction = await testPrisma.transaction.create({
      data: {
        amount: 3000000,
        description: "Pembayaran Sewa",
        date: new Date("2025-01-05"),
        type: "INCOME",
        location_id: location.id,
        related_id: { payment_id: payment.id },
      },
    });
    return { location, room, tenant, booking, bill, payment, transaction };
  }

  it("soft-deletes a booking and its sub-tree, excluding them from reads", async () => {
    const { location, booking, payment, transaction } =
      await createFinancialBooking();

    // Present before deletion
    expect(
      (await getBookingsByLocation(location.id)).some((b) => b.id === booking.id)
    ).toBe(true);
    expect(
      (await getRecentPayments(location.id)).some((p) => p.id === payment.id)
    ).toBe(true);
    expect(
      (await getTransactionsByLocation(location.id)).some(
        (t) => t.id === transaction.id
      )
    ).toBe(true);

    const result = await deleteBookingAction(booking.id);
    expect(result.success).toBe(true);

    // Excluded from all reads after deletion
    expect(
      (await getBookingsByLocation(location.id)).some((b) => b.id === booking.id)
    ).toBe(false);
    expect(await getBookingById(booking.id, null)).toBeNull();
    expect(
      (await getRecentPayments(location.id)).some((p) => p.id === payment.id)
    ).toBe(false);
    expect(
      (await getTransactionsByLocation(location.id)).some(
        (t) => t.id === transaction.id
      )
    ).toBe(false);

    // Rows still exist in DB (audit retention)
    const rawBooking = await testPrisma.booking.findUnique({
      where: { id: booking.id },
    });
    expect(rawBooking).not.toBeNull();
    expect(rawBooking!.deletedAt).not.toBeNull();

    const rawBill = await testPrisma.bill.findFirst({
      where: { booking_id: booking.id },
    });
    expect(rawBill!.deletedAt).not.toBeNull();

    const rawPayment = await testPrisma.payment.findUnique({
      where: { id: payment.id },
    });
    expect(rawPayment!.deletedAt).not.toBeNull();

    const rawTransaction = await testPrisma.transaction.findUnique({
      where: { id: transaction.id },
    });
    expect(rawTransaction).not.toBeNull();
    expect(rawTransaction!.deletedAt).not.toBeNull();
  });

  it("soft-deletes a payment and its transactions, excluding them from reads", async () => {
    const { location, payment, transaction } = await createFinancialBooking();

    const result = await deletePaymentAction(payment.id);
    expect(result.success).toBe(true);

    expect(
      (await getRecentPayments(location.id)).some((p) => p.id === payment.id)
    ).toBe(false);
    expect(
      (await getTransactionsByLocation(location.id)).some(
        (t) => t.id === transaction.id
      )
    ).toBe(false);

    const rawPayment = await testPrisma.payment.findUnique({
      where: { id: payment.id },
    });
    expect(rawPayment).not.toBeNull();
    expect(rawPayment!.deletedAt).not.toBeNull();

    const rawTransaction = await testPrisma.transaction.findUnique({
      where: { id: transaction.id },
    });
    expect(rawTransaction).not.toBeNull();
    expect(rawTransaction!.deletedAt).not.toBeNull();
  });
});
