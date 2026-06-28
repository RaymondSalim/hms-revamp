import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import { getActionQueue } from "@/app/_db/today-tasks";
import { businessToday } from "@/app/_lib/util/business-time";

const DAY = 86_400_000;

describe("getActionQueue", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  async function tenant(name: string, email: string | null = `${name}@t.com`) {
    return testPrisma.tenant.create({
      data: { name, id_number: `id-${name}-${Date.now()}`, email },
    });
  }

  it("returns unverified payments (PENDING only), scoped, capped at 5", async () => {
    const t = await tenant("Andi");
    const b = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: businessToday(), status_id: 2, fee: 1, is_rolling: true },
    });
    // 6 pending → expect cap 5; 1 verified → excluded
    for (let i = 0; i < 6; i++) {
      await testPrisma.payment.create({
        data: { booking_id: b.id, amount: 100 + i, payment_date: businessToday(), payment_method: "CASH", status_id: 1 },
      });
    }
    await testPrisma.payment.create({
      data: { booking_id: b.id, amount: 999, payment_date: businessToday(), payment_method: "CASH", status_id: 2 },
    });

    const q = await getActionQueue(1);
    expect(q.payments).toHaveLength(5);
    expect(q.payments[0].kind).toBe("payment");
    expect(q.payments[0].bookingId).toBe(b.id);
    expect(q.payments[0].href).toBe("/payments?status=pending");
  });

  it("returns overdue bills with outstanding > 0 and sets canEmail from tenant email", async () => {
    const today = businessToday();
    const tWith = await tenant("Eka", "eka@t.com");
    const bWith = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: tWith.id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    const overdue = await testPrisma.bill.create({
      data: { booking_id: bWith.id, description: "OD", due_date: new Date(today.getTime() - 5 * DAY), invoice_number: `INV-OD-${Date.now()}` },
    });
    await testPrisma.billItem.create({ data: { bill_id: overdue.id, description: "Sewa", amount: 500000 } });

    // tenant with NO email → canEmail false
    const tNo = await tenant("NoMail", null);
    const bNo = await testPrisma.booking.create({
      data: { room_id: 2, tenant_id: tNo.id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    const overdue2 = await testPrisma.bill.create({
      data: { booking_id: bNo.id, description: "OD2", due_date: new Date(today.getTime() - 3 * DAY), invoice_number: `INV-OD2-${Date.now()}` },
    });
    await testPrisma.billItem.create({ data: { bill_id: overdue2.id, description: "Sewa", amount: 300000 } });

    // fully-paid past-due → excluded
    const paid = await testPrisma.bill.create({
      data: { booking_id: bWith.id, description: "PD", due_date: new Date(today.getTime() - 2 * DAY), invoice_number: `INV-PD-${Date.now()}` },
    });
    await testPrisma.billItem.create({ data: { bill_id: paid.id, description: "Sewa", amount: 100000 } });
    const pay = await testPrisma.payment.create({
      data: { booking_id: bWith.id, amount: 100000, payment_date: today, payment_method: "CASH", status_id: 2 },
    });
    await testPrisma.paymentBill.create({ data: { payment_id: pay.id, bill_id: paid.id, amount: 100000 } });

    const q = await getActionQueue(1);
    expect(q.bills).toHaveLength(2);
    const byId = Object.fromEntries(q.bills.map((x) => [x.id, x]));
    expect(byId[overdue.id].canEmail).toBe(true);
    expect(byId[overdue2.id].canEmail).toBe(false);
    expect(byId[overdue.id].href).toBe("/bills?overdue=1");
  });

  it("returns check-ins due (today, ACTIVE/PENDING, no CHECK_IN log) with tenantId", async () => {
    const today = businessToday();
    const t = await tenant("Cika");
    const b = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    const checkedIn = await testPrisma.booking.create({
      data: { room_id: 2, tenant_id: (await tenant("Dani")).id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    await testPrisma.checkInOutLog.create({
      data: { booking_id: checkedIn.id, event_type: "CHECK_IN", event_date: today },
    });

    const q = await getActionQueue(1);
    expect(q.checkins).toHaveLength(1);
    expect(q.checkins[0].id).toBe(b.id);
    expect(q.checkins[0].tenantId).toBe(t.id);
    expect(q.checkins[0].href).toBe("/bookings?checkin=today");
  });

  it("returns expiring bookings (ACTIVE, non-rolling, end_date within 30 days)", async () => {
    const today = businessToday();
    const t = await tenant("Fajar");
    await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: new Date(today.getTime() - 20 * DAY), end_date: new Date(today.getTime() + 10 * DAY), status_id: 2, is_rolling: false, fee: 1 },
    });
    const q = await getActionQueue(1);
    expect(q.expiring).toHaveLength(1);
    expect(q.expiring[0].href).toBe("/bookings?expiring=1");
  });

  it("scopes all groups to the requested location", async () => {
    const q = await getActionQueue(99999);
    expect(q).toEqual({ payments: [], bills: [], checkins: [], expiring: [] });
  });
});
