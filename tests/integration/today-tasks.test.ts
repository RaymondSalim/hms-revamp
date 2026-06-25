import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import { getTodayTaskCounts } from "@/app/_db/today-tasks";
import { getPaymentsPage } from "@/app/_db/payments";
import { businessToday } from "@/app/_lib/util/business-time";

const DAY = 86_400_000;

describe("getTodayTaskCounts", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  async function tenant(name: string) {
    return testPrisma.tenant.create({
      data: { name, id_number: `id-${name}-${Date.now()}`, email: `${name}@t.com` },
    });
  }

  it("counts check-ins due: starts today, ACTIVE/PENDING, no CHECK_IN log", async () => {
    const today = businessToday();
    const t1 = await tenant("Andi");
    // due today, no check-in log → counts
    await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t1.id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    // due today but already checked in → excluded
    const t2 = await tenant("Budi");
    const checkedIn = await testPrisma.booking.create({
      data: { room_id: 2, tenant_id: t2.id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    await testPrisma.checkInOutLog.create({
      data: { booking_id: checkedIn.id, event_type: "CHECK_IN", event_date: today },
    });
    // starts tomorrow → excluded
    const t3 = await tenant("Cika");
    await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t3.id, start_date: new Date(today.getTime() + DAY), status_id: 2, fee: 1, is_rolling: true },
    });

    const counts = await getTodayTaskCounts(1);
    expect(counts.checkInsDue).toBe(1);
  });

  it("counts unverified payments: status PENDING only", async () => {
    const t = await tenant("Dewi");
    const b = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: businessToday(), status_id: 2, fee: 1, is_rolling: true },
    });
    await testPrisma.payment.create({
      data: { booking_id: b.id, amount: 100, payment_date: businessToday(), payment_method: "CASH", status_id: 1 },
    });
    await testPrisma.payment.create({
      data: { booking_id: b.id, amount: 200, payment_date: businessToday(), payment_method: "CASH", status_id: 2 },
    });
    const counts = await getTodayTaskCounts(1);
    expect(counts.unverifiedPayments).toBe(1);
  });

  it("counts overdue bills: due before today AND outstanding > 0", async () => {
    const today = businessToday();
    const t = await tenant("Eka");
    const b = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    // past-due, unpaid → counts
    const overdue = await testPrisma.bill.create({
      data: { booking_id: b.id, description: "Overdue", due_date: new Date(today.getTime() - 5 * DAY), invoice_number: `INV-OD-${Date.now()}` },
    });
    await testPrisma.billItem.create({ data: { bill_id: overdue.id, description: "Sewa", amount: 500000 } });
    // past-due, fully paid → excluded
    const paid = await testPrisma.bill.create({
      data: { booking_id: b.id, description: "Paid", due_date: new Date(today.getTime() - 3 * DAY), invoice_number: `INV-PD-${Date.now()}` },
    });
    await testPrisma.billItem.create({ data: { bill_id: paid.id, description: "Sewa", amount: 300000 } });
    const pay = await testPrisma.payment.create({
      data: { booking_id: b.id, amount: 300000, payment_date: today, payment_method: "CASH", status_id: 2 },
    });
    await testPrisma.paymentBill.create({ data: { payment_id: pay.id, bill_id: paid.id, amount: 300000 } });
    // future-due, unpaid → excluded
    const future = await testPrisma.bill.create({
      data: { booking_id: b.id, description: "Future", due_date: new Date(today.getTime() + 5 * DAY), invoice_number: `INV-FT-${Date.now()}` },
    });
    await testPrisma.billItem.create({ data: { bill_id: future.id, description: "Sewa", amount: 400000 } });

    const counts = await getTodayTaskCounts(1);
    expect(counts.overdueBills).toBe(1);
  });

  it("counts expiring bookings: ACTIVE, non-rolling, end_date within 30 days", async () => {
    const today = businessToday();
    const t1 = await tenant("Fajar");
    // ends in 10 days, non-rolling, ACTIVE → counts
    await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t1.id, start_date: new Date(today.getTime() - 20 * DAY), end_date: new Date(today.getTime() + 10 * DAY), status_id: 2, is_rolling: false, fee: 1 },
    });
    // rolling (no end_date) → excluded
    const t2 = await tenant("Gita");
    await testPrisma.booking.create({
      data: { room_id: 2, tenant_id: t2.id, start_date: today, status_id: 2, is_rolling: true, fee: 1 },
    });
    // ends in 40 days → excluded
    const t3 = await tenant("Hadi");
    await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t3.id, start_date: today, end_date: new Date(today.getTime() + 40 * DAY), status_id: 2, is_rolling: false, fee: 1 },
    });
    // COMPLETED → excluded
    const t4 = await tenant("Indah");
    await testPrisma.booking.create({
      data: { room_id: 2, tenant_id: t4.id, start_date: today, end_date: new Date(today.getTime() + 10 * DAY), status_id: 3, is_rolling: false, fee: 1 },
    });

    const counts = await getTodayTaskCounts(1);
    expect(counts.expiringBookings).toBe(1);
  });

  it("scopes all counts to the requested location", async () => {
    const counts = await getTodayTaskCounts(99999);
    expect(counts).toEqual({ checkInsDue: 0, unverifiedPayments: 0, overdueBills: 0, expiringBookings: 0 });
  });
});

describe("getPaymentsPage status filter", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it("returns only PENDING payments when status='pending'", async () => {
    const t = await testPrisma.tenant.create({
      data: { name: "Joko", id_number: `id-j-${Date.now()}`, email: "j@t.com" },
    });
    const b = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: businessToday(), status_id: 2, fee: 1, is_rolling: true },
    });
    await testPrisma.payment.create({
      data: { booking_id: b.id, amount: 100, payment_date: businessToday(), payment_method: "CASH", status_id: 1 },
    });
    await testPrisma.payment.create({
      data: { booking_id: b.id, amount: 200, payment_date: businessToday(), payment_method: "CASH", status_id: 2 },
    });

    const base = { page: 1, pageSize: 10, search: "", sortBy: null, sortDir: "desc" as const };
    const pending = await getPaymentsPage(1, base, { status: "pending" });
    expect(pending.total).toBe(1);
    expect(pending.rows[0].status_id).toBe(1);

    const all = await getPaymentsPage(1, base);
    expect(all.total).toBe(2);
  });
});
