import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { getBillsPage } from "@/app/_db/bills";
import { getPaymentsPage } from "@/app/_db/payments";
import { getBookingsPage } from "@/app/_db/bookings";
import { getRoomsPage } from "@/app/_db/rooms";
import type { TableParams } from "@/app/_lib/util/table-params";

const baseParams: TableParams = {
  page: 1,
  pageSize: 10,
  search: "",
  sortBy: null,
  sortDir: "desc",
};

describe("server-side table pagination", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  // Location 1, rooms 101/102 are seeded. Create a tenant + booking + bills.
  async function seedBills(count: number) {
    const tenant = await testPrisma.tenant.create({
      data: { name: "Budi Santoso", id_number: `id-${Date.now()}`, email: "b@t.com" },
    });
    const booking = await testPrisma.booking.create({
      data: {
        room_id: 1,
        tenant_id: tenant.id,
        start_date: new Date("2025-01-01"),
        fee: 1000000,
        is_rolling: true,
      },
    });
    for (let i = 0; i < count; i++) {
      await testPrisma.bill.create({
        data: {
          booking_id: booking.id,
          description: `Tagihan ${i + 1}`,
          due_date: new Date(Date.UTC(2025, i, 28)),
          invoice_number: `INV-${i + 1}`,
        },
      });
    }
    return { tenant, booking };
  }

  describe("getBillsPage", () => {
    it("paginates: respects pageSize and reports total/pageCount", async () => {
      await seedBills(25);

      const p1 = await getBillsPage(1, { ...baseParams, pageSize: 10, page: 1 });
      expect(p1.rows).toHaveLength(10);
      expect(p1.total).toBe(25);
      expect(p1.pageCount).toBe(3);

      const p3 = await getBillsPage(1, { ...baseParams, pageSize: 10, page: 3 });
      expect(p3.rows).toHaveLength(5); // remainder
    });

    it("does not overlap rows across pages", async () => {
      await seedBills(15);
      const p1 = await getBillsPage(1, { ...baseParams, pageSize: 5, page: 1 });
      const p2 = await getBillsPage(1, { ...baseParams, pageSize: 5, page: 2 });
      const ids = new Set(p1.rows.map((r) => r.id));
      expect(p2.rows.some((r) => ids.has(r.id))).toBe(false);
    });

    it("searches by invoice number, description, and tenant name", async () => {
      await seedBills(3);
      const byInvoice = await getBillsPage(1, { ...baseParams, search: "INV-2" });
      expect(byInvoice.total).toBe(1);
      expect(byInvoice.rows[0].invoice_number).toBe("INV-2");

      const byTenant = await getBillsPage(1, { ...baseParams, search: "budi" });
      expect(byTenant.total).toBe(3); // all bills belong to Budi

      const noMatch = await getBillsPage(1, { ...baseParams, search: "zzzzz" });
      expect(noMatch.total).toBe(0);
    });

    it("sorts by due_date ascending and descending", async () => {
      await seedBills(3);
      const asc = await getBillsPage(1, {
        ...baseParams,
        sortBy: "due_date",
        sortDir: "asc",
      });
      const ascDates = asc.rows.map((r) => r.due_date.getTime());
      expect(ascDates).toEqual([...ascDates].sort((a, b) => a - b));

      const desc = await getBillsPage(1, {
        ...baseParams,
        sortBy: "due_date",
        sortDir: "desc",
      });
      const descDates = desc.rows.map((r) => r.due_date.getTime());
      expect(descDates).toEqual([...descDates].sort((a, b) => b - a));
    });

    it("excludes soft-deleted bills from the page and total", async () => {
      const { booking } = await seedBills(3);
      const firstBill = await testPrisma.bill.findFirst({
        where: { booking_id: booking.id },
      });
      await testPrisma.bill.update({
        where: { id: firstBill!.id },
        data: { deletedAt: new Date() },
      });

      const page = await getBillsPage(1, baseParams);
      expect(page.total).toBe(2);
      expect(page.rows.some((r) => r.id === firstBill!.id)).toBe(false);
    });

    it("scopes results to the requested location", async () => {
      await seedBills(2);
      const otherLoc = await getBillsPage(99999, baseParams);
      expect(otherLoc.total).toBe(0);
    });
  });

  describe("getPaymentsPage", () => {
    it("paginates and searches by tenant name and payment method", async () => {
      const tenant = await testPrisma.tenant.create({
        data: { name: "Citra Dewi", id_number: `id-${Date.now()}`, email: "c@t.com" },
      });
      const booking = await testPrisma.booking.create({
        data: {
          room_id: 1,
          tenant_id: tenant.id,
          start_date: new Date("2025-01-01"),
          fee: 1000000,
          is_rolling: true,
        },
      });
      await testPrisma.payment.create({
        data: {
          booking_id: booking.id,
          amount: 500000,
          payment_date: new Date("2025-01-05"),
          payment_method: "CASH",
        },
      });
      await testPrisma.payment.create({
        data: {
          booking_id: booking.id,
          amount: 700000,
          payment_date: new Date("2025-02-05"),
          payment_method: "BANK_TRANSFER",
        },
      });

      const all = await getPaymentsPage(1, baseParams);
      expect(all.total).toBe(2);

      const byTenant = await getPaymentsPage(1, { ...baseParams, search: "citra" });
      expect(byTenant.total).toBe(2);

      const byMethod = await getPaymentsPage(1, { ...baseParams, search: "cash" });
      expect(byMethod.total).toBe(1);
      expect(byMethod.rows[0].payment_method).toBe("CASH");

      const byMethodTransfer = await getPaymentsPage(1, {
        ...baseParams,
        search: "transfer",
      });
      expect(byMethodTransfer.total).toBe(1);
      expect(byMethodTransfer.rows[0].payment_method).toBe("BANK_TRANSFER");
    });
  });

  describe("getBookingsPage", () => {
    it("paginates and searches by tenant name / room number", async () => {
      const t1 = await testPrisma.tenant.create({
        data: { name: "Andi", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
      });
      const t2 = await testPrisma.tenant.create({
        data: { name: "Bekti", id_number: `id-b-${Date.now()}`, email: "b2@t.com" },
      });
      await testPrisma.booking.create({
        data: { room_id: 1, tenant_id: t1.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      await testPrisma.booking.create({
        data: { room_id: 2, tenant_id: t2.id, start_date: new Date("2025-02-01"), fee: 1, is_rolling: true },
      });

      const all = await getBookingsPage(1, baseParams);
      expect(all.total).toBe(2);

      const byTenant = await getBookingsPage(1, { ...baseParams, search: "andi" });
      expect(byTenant.total).toBe(1);

      const byRoom = await getBookingsPage(1, { ...baseParams, search: "102" });
      expect(byRoom.total).toBe(1);
      expect(byRoom.rows[0].rooms?.room_number).toBe("102");
    });

    it("excludes soft-deleted bookings", async () => {
      const t1 = await testPrisma.tenant.create({
        data: { name: "Andi", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
      });
      const b = await testPrisma.booking.create({
        data: { room_id: 1, tenant_id: t1.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      await testPrisma.booking.update({
        where: { id: b.id },
        data: { deletedAt: new Date() },
      });
      const page = await getBookingsPage(1, baseParams);
      expect(page.total).toBe(0);
    });
  });

  describe("getRoomsPage", () => {
    it("paginates and reports total/pageCount for the location", async () => {
      // seedTestData seeds 2 rooms (101, 102) in location 1.
      const p1 = await getRoomsPage(1, { ...baseParams, pageSize: 1, page: 1 });
      expect(p1.rows).toHaveLength(1);
      expect(p1.total).toBe(2);
      expect(p1.pageCount).toBe(2);
    });

    it("does not overlap rows across pages (stable id tiebreaker)", async () => {
      const p1 = await getRoomsPage(1, { ...baseParams, pageSize: 1, page: 1 });
      const p2 = await getRoomsPage(1, { ...baseParams, pageSize: 1, page: 2 });
      expect(p1.rows[0].id).not.toBe(p2.rows[0].id);
    });

    it("searches by room number", async () => {
      const r = await getRoomsPage(1, { ...baseParams, search: "101" });
      expect(r.total).toBe(1);
      expect(r.rows[0].room_number).toBe("101");
    });

    it("searches by room type name", async () => {
      const r = await getRoomsPage(1, { ...baseParams, search: "standard" });
      expect(r.total).toBe(2);
    });

    it("sorts by room_number ascending and descending", async () => {
      const asc = await getRoomsPage(1, { ...baseParams, sortBy: "room_number", sortDir: "asc" });
      expect(asc.rows.map((r) => r.room_number)).toEqual(["101", "102"]);
      const desc = await getRoomsPage(1, { ...baseParams, sortBy: "room_number", sortDir: "desc" });
      expect(desc.rows.map((r) => r.room_number)).toEqual(["102", "101"]);
    });

    it("scopes results to the requested location", async () => {
      const other = await getRoomsPage(99999, baseParams);
      expect(other.total).toBe(0);
    });

    it("falls back to default sort for an unknown sortBy", async () => {
      const r = await getRoomsPage(1, { ...baseParams, sortBy: "nonexistent" });
      expect(r.total).toBe(2); // does not throw
    });
  });
});
