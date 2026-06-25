import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import { getTodayTaskCounts } from "@/app/_db/today-tasks";
import { getPaymentsPage } from "@/app/_db/payments";
import { getBookingsPage } from "@/app/_db/bookings";
import { getBillsPage } from "@/app/_db/bills";
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

describe("getBookingsPage checkin/expiring filters", () => {
  const DAY = 86_400_000;
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it("checkin='today' returns only today's un-checked-in PENDING/ACTIVE bookings", async () => {
    const today = businessToday();
    const t1 = await testPrisma.tenant.create({ data: { name: "K", id_number: `k-${Date.now()}`, email: "k@t.com" } });
    await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t1.id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    const t2 = await testPrisma.tenant.create({ data: { name: "L", id_number: `l-${Date.now()}`, email: "l@t.com" } });
    const ci = await testPrisma.booking.create({
      data: { room_id: 2, tenant_id: t2.id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    await testPrisma.checkInOutLog.create({ data: { booking_id: ci.id, event_type: "CHECK_IN", event_date: today } });

    const base = { page: 1, pageSize: 10, search: "", sortBy: null, sortDir: "desc" as const };
    const r = await getBookingsPage(1, base, { checkin: "today" });
    expect(r.total).toBe(1);
  });

  it("expiring=true returns only ACTIVE non-rolling bookings ending within 30 days", async () => {
    const today = businessToday();
    const t1 = await testPrisma.tenant.create({ data: { name: "M", id_number: `m-${Date.now()}`, email: "m@t.com" } });
    await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t1.id, start_date: new Date(today.getTime() - 20 * DAY), end_date: new Date(today.getTime() + 10 * DAY), status_id: 2, is_rolling: false, fee: 1 },
    });
    const t2 = await testPrisma.tenant.create({ data: { name: "N", id_number: `n-${Date.now()}`, email: "n@t.com" } });
    await testPrisma.booking.create({
      data: { room_id: 2, tenant_id: t2.id, start_date: today, status_id: 2, is_rolling: true, fee: 1 },
    });

    const base = { page: 1, pageSize: 10, search: "", sortBy: null, sortDir: "desc" as const };
    const r = await getBookingsPage(1, base, { expiring: true });
    expect(r.total).toBe(1);
  });
});

describe("getBillsPage overdue filter", () => {
  const DAY = 86_400_000;
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  let billCounter = 0;
  async function bill(bookingId: number, dueOffsetDays: number, amount: number, paid: number, tag: string) {
    const today = businessToday();
    billCounter++;
    const b = await testPrisma.bill.create({
      data: {
        booking_id: bookingId,
        description: tag,
        due_date: new Date(today.getTime() + dueOffsetDays * DAY + billCounter * 60000),
        invoice_number: `INV-${tag}-${Date.now()}-${billCounter}`,
      },
    });
    await testPrisma.billItem.create({ data: { bill_id: b.id, description: "Sewa", amount } });
    if (paid > 0) {
      const p = await testPrisma.payment.create({
        data: { booking_id: bookingId, amount: paid, payment_date: today, payment_method: "CASH", status_id: 2 },
      });
      await testPrisma.paymentBill.create({ data: { payment_id: p.id, bill_id: b.id, amount: paid } });
    }
    return b;
  }

  it("returns only past-due bills with outstanding > 0, paginated", async () => {
    billCounter = 0;
    const t = await testPrisma.tenant.create({ data: { name: "O", id_number: `o-${Date.now()}`, email: "o@t.com" } });
    const bk = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: businessToday(), status_id: 2, fee: 1, is_rolling: true },
    });
    await bill(bk.id, -5, 500000, 0, "OD1");    // past-due, unpaid → in
    await bill(bk.id, -3, 400000, 0, "OD2");    // past-due, unpaid → in
    await bill(bk.id, -7, 300000, 300000, "PD"); // past-due, fully paid → out
    await bill(bk.id, 5, 200000, 0, "FT");       // future-due → out

    const base = { page: 1, pageSize: 10, search: "", sortBy: null, sortDir: "desc" as const };
    const r = await getBillsPage(1, base, { overdue: true });
    expect(r.total).toBe(2);

    // pagination of the subset: pageSize 1 → 2 pages, disjoint
    const p1 = await getBillsPage(1, { ...base, pageSize: 1, page: 1 }, { overdue: true });
    const p2 = await getBillsPage(1, { ...base, pageSize: 1, page: 2 }, { overdue: true });
    expect(p1.rows).toHaveLength(1);
    expect(p2.rows).toHaveLength(1);
    expect(p1.pageCount).toBe(2);
    expect(p1.rows[0].id).not.toBe(p2.rows[0].id);
  });

  it("unfiltered getBillsPage still returns all non-deleted bills", async () => {
    billCounter = 0;
    const t = await testPrisma.tenant.create({ data: { name: "P", id_number: `p-${Date.now()}`, email: "p@t.com" } });
    const bk = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: businessToday(), status_id: 2, fee: 1, is_rolling: true },
    });
    await bill(bk.id, -5, 500000, 500000, "PAID");
    await bill(bk.id, 5, 200000, 0, "FUT");
    const base = { page: 1, pageSize: 10, search: "", sortBy: null, sortDir: "desc" as const };
    const all = await getBillsPage(1, base);
    expect(all.total).toBe(2); // overdue filter NOT applied
  });
});
