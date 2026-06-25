import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { getBillsPage } from "@/app/_db/bills";
import { getPaymentsPage } from "@/app/_db/payments";
import { getBookingsPage } from "@/app/_db/bookings";
import { getRoomsPage } from "@/app/_db/rooms";
import { getAddonsPage } from "@/app/_db/addons";
import { getTenantsPage } from "@/app/_db/tenant";
import { getGuestsPage } from "@/app/_db/guests";
import { getDepositsPage } from "@/app/_db/deposits";
import { getUtilitiesPage } from "@/app/_db/utilities";
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

    it("sorts by room_tenant (tenant name relation) asc and desc", async () => {
      const tZ = await testPrisma.tenant.create({
        data: { name: "Zulkifli", id_number: `id-z-${Date.now()}`, email: "z@t.com" },
      });
      const tA = await testPrisma.tenant.create({
        data: { name: "Anwar", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
      });
      const bZ = await testPrisma.booking.create({
        data: { room_id: 1, tenant_id: tZ.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      const bA = await testPrisma.booking.create({
        data: { room_id: 2, tenant_id: tA.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      await testPrisma.bill.create({
        data: { booking_id: bZ.id, description: "Tagihan Z", due_date: new Date("2025-01-28"), invoice_number: "INV-Z" },
      });
      await testPrisma.bill.create({
        data: { booking_id: bA.id, description: "Tagihan A", due_date: new Date("2025-01-28"), invoice_number: "INV-A" },
      });

      const asc = await getBillsPage(1, { ...baseParams, sortBy: "room_tenant", sortDir: "asc" });
      expect(asc.rows.map((r) => r.bookings?.tenants?.name)).toEqual(["Anwar", "Zulkifli"]);

      const desc = await getBillsPage(1, { ...baseParams, sortBy: "room_tenant", sortDir: "desc" });
      expect(desc.rows.map((r) => r.bookings?.tenants?.name)).toEqual(["Zulkifli", "Anwar"]);
    });

    it("falls back to default sort (due_date) for an unknown sortBy (no throw)", async () => {
      await seedBills(2);
      const r = await getBillsPage(1, { ...baseParams, sortBy: "not_a_column" });
      expect(r.total).toBe(2);
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

    it("sorts by booking (tenant name relation) asc and desc", async () => {
      const tZ = await testPrisma.tenant.create({
        data: { name: "Zulkifli", id_number: `id-z-${Date.now()}`, email: "z@t.com" },
      });
      const tA = await testPrisma.tenant.create({
        data: { name: "Anwar", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
      });
      const bZ = await testPrisma.booking.create({
        data: { room_id: 1, tenant_id: tZ.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      const bA = await testPrisma.booking.create({
        data: { room_id: 2, tenant_id: tA.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      await testPrisma.payment.create({
        data: { booking_id: bZ.id, amount: 100, payment_date: new Date("2025-01-05"), payment_method: "CASH" },
      });
      await testPrisma.payment.create({
        data: { booking_id: bA.id, amount: 200, payment_date: new Date("2025-02-05"), payment_method: "CASH" },
      });

      const asc = await getPaymentsPage(1, { ...baseParams, sortBy: "booking", sortDir: "asc" });
      expect(asc.rows.map((r) => r.bookings?.tenants?.name)).toEqual(["Anwar", "Zulkifli"]);

      const desc = await getPaymentsPage(1, { ...baseParams, sortBy: "booking", sortDir: "desc" });
      expect(desc.rows.map((r) => r.bookings?.tenants?.name)).toEqual(["Zulkifli", "Anwar"]);
    });

    it("sorts by status (relation) asc", async () => {
      const t = await testPrisma.tenant.create({
        data: { name: "Andi", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
      });
      const b = await testPrisma.booking.create({
        data: { room_id: 1, tenant_id: t.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      // status 1 = PENDING, status 2 = VERIFIED. asc by string: PENDING < VERIFIED.
      await testPrisma.payment.create({
        data: { booking_id: b.id, amount: 100, payment_date: new Date("2025-01-05"), payment_method: "CASH", status_id: 2 },
      });
      await testPrisma.payment.create({
        data: { booking_id: b.id, amount: 200, payment_date: new Date("2025-02-05"), payment_method: "CASH", status_id: 1 },
      });

      const asc = await getPaymentsPage(1, { ...baseParams, sortBy: "status", sortDir: "asc" });
      expect(asc.rows.map((r) => r.paymentstatuses?.status)).toEqual(["PENDING", "VERIFIED"]);
    });

    it("falls back to default sort for an unknown sortBy (no throw)", async () => {
      const t = await testPrisma.tenant.create({
        data: { name: "Andi", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
      });
      const b = await testPrisma.booking.create({
        data: { room_id: 1, tenant_id: t.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      await testPrisma.payment.create({
        data: { booking_id: b.id, amount: 100, payment_date: new Date("2025-01-05"), payment_method: "CASH" },
      });
      const r = await getPaymentsPage(1, { ...baseParams, sortBy: "not_a_column" });
      expect(r.total).toBe(1);
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

    it("sorts by tenant name (relation) asc and desc", async () => {
      const tZ = await testPrisma.tenant.create({
        data: { name: "Zulkifli", id_number: `id-z-${Date.now()}`, email: "z@t.com" },
      });
      const tA = await testPrisma.tenant.create({
        data: { name: "Anwar", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
      });
      // Zulkifli in room 101, Anwar in room 102 — name order is the reverse of room order.
      await testPrisma.booking.create({
        data: { room_id: 1, tenant_id: tZ.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      await testPrisma.booking.create({
        data: { room_id: 2, tenant_id: tA.id, start_date: new Date("2025-02-01"), fee: 1, is_rolling: true },
      });

      const asc = await getBookingsPage(1, { ...baseParams, sortBy: "tenant", sortDir: "asc" });
      expect(asc.rows.map((r) => r.tenants?.name)).toEqual(["Anwar", "Zulkifli"]);

      const desc = await getBookingsPage(1, { ...baseParams, sortBy: "tenant", sortDir: "desc" });
      expect(desc.rows.map((r) => r.tenants?.name)).toEqual(["Zulkifli", "Anwar"]);
    });

    it("sorts by room number (relation) asc and desc", async () => {
      const tZ = await testPrisma.tenant.create({
        data: { name: "Zulkifli", id_number: `id-z-${Date.now()}`, email: "z@t.com" },
      });
      const tA = await testPrisma.tenant.create({
        data: { name: "Anwar", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
      });
      await testPrisma.booking.create({
        data: { room_id: 1, tenant_id: tZ.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      await testPrisma.booking.create({
        data: { room_id: 2, tenant_id: tA.id, start_date: new Date("2025-02-01"), fee: 1, is_rolling: true },
      });

      const asc = await getBookingsPage(1, { ...baseParams, sortBy: "room", sortDir: "asc" });
      expect(asc.rows.map((r) => r.rooms?.room_number)).toEqual(["101", "102"]);

      const desc = await getBookingsPage(1, { ...baseParams, sortBy: "room", sortDir: "desc" });
      expect(desc.rows.map((r) => r.rooms?.room_number)).toEqual(["102", "101"]);
    });

    it("sorts by status (relation) asc", async () => {
      const t1 = await testPrisma.tenant.create({
        data: { name: "Andi", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
      });
      const t2 = await testPrisma.tenant.create({
        data: { name: "Budi", id_number: `id-b-${Date.now()}`, email: "b@t.com" },
      });
      // status 2 = ACTIVE, status 1 = PENDING. asc by the status STRING: ACTIVE < PENDING.
      await testPrisma.booking.create({
        data: { room_id: 1, tenant_id: t1.id, status_id: 1, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      await testPrisma.booking.create({
        data: { room_id: 2, tenant_id: t2.id, status_id: 2, start_date: new Date("2025-02-01"), fee: 1, is_rolling: true },
      });

      const asc = await getBookingsPage(1, { ...baseParams, sortBy: "status", sortDir: "asc" });
      expect(asc.rows.map((r) => r.bookingstatuses?.status)).toEqual(["ACTIVE", "PENDING"]);
    });

    it("falls back to default sort for an unknown sortBy (no throw)", async () => {
      const t = await testPrisma.tenant.create({
        data: { name: "Andi", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
      });
      await testPrisma.booking.create({
        data: { room_id: 1, tenant_id: t.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      const r = await getBookingsPage(1, { ...baseParams, sortBy: "not_a_column" });
      expect(r.total).toBe(1);
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

  describe("getAddonsPage", () => {
    beforeEach(async () => {
      // seedTestData has run; add addons in location 1.
      // Create location 2 for cross-location scoping test
      await testPrisma.location.create({
        data: { id: 2, name: "Location 2", address: "Jl. Test 456" },
      });
      await testPrisma.addOn.createMany({
        data: [
          { id: "a1", name: "Laundry", description: "Cuci setrika", location_id: 1, requires_input: false },
          { id: "a2", name: "Parkir", description: "Parkir motor", location_id: 1, requires_input: false },
          { id: "a3", name: "WiFi", description: "Internet cepat", location_id: 2, requires_input: false },
        ],
      });
    });

    it("paginates and scopes to the location", async () => {
      const r = await getAddonsPage(1, baseParams);
      expect(r.total).toBe(2); // a1, a2 in location 1; a3 is location 2
    });

    it("searches by name and description", async () => {
      const byName = await getAddonsPage(1, { ...baseParams, search: "laundry" });
      expect(byName.total).toBe(1);
      const byDesc = await getAddonsPage(1, { ...baseParams, search: "parkir motor" });
      expect(byDesc.total).toBe(1);
    });

    it("sorts by name ascending and descending", async () => {
      const asc = await getAddonsPage(1, { ...baseParams, sortBy: "name", sortDir: "asc" });
      expect(asc.rows.map((r) => r.name)).toEqual(["Laundry", "Parkir"]);
      const desc = await getAddonsPage(1, { ...baseParams, sortBy: "name", sortDir: "desc" });
      expect(desc.rows.map((r) => r.name)).toEqual(["Parkir", "Laundry"]);
    });
  });

  describe("getTenantsPage", () => {
    beforeEach(async () => {
      await testPrisma.tenant.createMany({
        data: [
          { name: "Ahmad", id_number: "t-ahmad", email: "ahmad@x.com", phone: "0811" },
          { name: "Bayu", id_number: "t-bayu", email: "bayu@x.com", phone: "0822" },
          { name: "Cipto", id_number: "t-cipto", email: "cipto@x.com", phone: "0833" },
        ],
      });
    });

    it("paginates across the full (global) tenant set", async () => {
      const p1 = await getTenantsPage({ ...baseParams, pageSize: 2, page: 1 });
      expect(p1.rows).toHaveLength(2);
      expect(p1.total).toBe(3);
      expect(p1.pageCount).toBe(2);
    });

    it("searches by name, email, phone, and id_number", async () => {
      expect((await getTenantsPage({ ...baseParams, search: "bayu" })).total).toBe(1);
      expect((await getTenantsPage({ ...baseParams, search: "cipto@x.com" })).total).toBe(1);
      expect((await getTenantsPage({ ...baseParams, search: "0811" })).total).toBe(1);
      expect((await getTenantsPage({ ...baseParams, search: "t-ahmad" })).total).toBe(1);
      expect((await getTenantsPage({ ...baseParams, search: "zzz" })).total).toBe(0);
    });

    it("sorts by name ascending and descending", async () => {
      const asc = await getTenantsPage({ ...baseParams, sortBy: "name", sortDir: "asc" });
      expect(asc.rows.map((r) => r.name)).toEqual(["Ahmad", "Bayu", "Cipto"]);
      const desc = await getTenantsPage({ ...baseParams, sortBy: "name", sortDir: "desc" });
      expect(desc.rows.map((r) => r.name)).toEqual(["Cipto", "Bayu", "Ahmad"]);
    });
  });

  describe("getGuestsPage", () => {
    async function seedGuests() {
      const tenant = await testPrisma.tenant.create({
        data: { name: "Dewi", id_number: `id-d-${Date.now()}`, email: "d@t.com" },
      });
      const booking = await testPrisma.booking.create({
        data: { room_id: 1, tenant_id: tenant.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      await testPrisma.guest.createMany({
        data: [
          { name: "Eka", email: "eka@g.com", phone: "0911", booking_id: booking.id },
          { name: "Fajar", email: "fajar@g.com", phone: "0922", booking_id: booking.id },
        ],
      });
      return { booking };
    }

    it("paginates and scopes guests to the location via booking→room", async () => {
      await seedGuests();
      const r = await getGuestsPage(1, baseParams);
      expect(r.total).toBe(2);
      const other = await getGuestsPage(99999, baseParams);
      expect(other.total).toBe(0);
    });

    it("searches by guest name, email, phone, and room number", async () => {
      await seedGuests();
      expect((await getGuestsPage(1, { ...baseParams, search: "eka" })).total).toBe(1);
      expect((await getGuestsPage(1, { ...baseParams, search: "fajar@g.com" })).total).toBe(1);
      expect((await getGuestsPage(1, { ...baseParams, search: "0911" })).total).toBe(1);
      expect((await getGuestsPage(1, { ...baseParams, search: "101" })).total).toBe(2); // both in room 101
    });

    it("sorts by name ascending and descending", async () => {
      await seedGuests();
      const asc = await getGuestsPage(1, { ...baseParams, sortBy: "name", sortDir: "asc" });
      expect(asc.rows.map((r) => r.name)).toEqual(["Eka", "Fajar"]);
      const desc = await getGuestsPage(1, { ...baseParams, sortBy: "name", sortDir: "desc" });
      expect(desc.rows.map((r) => r.name)).toEqual(["Fajar", "Eka"]);
    });
  });

  describe("getDepositsPage", () => {
    async function seedDeposits() {
      const t1 = await testPrisma.tenant.create({
        data: { name: "Gita", id_number: `id-g-${Date.now()}`, email: "g@t.com" },
      });
      const t2 = await testPrisma.tenant.create({
        data: { name: "Hadi", id_number: `id-h-${Date.now()}`, email: "h@t.com" },
      });
      const b1 = await testPrisma.booking.create({
        data: { room_id: 1, tenant_id: t1.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      const b2 = await testPrisma.booking.create({
        data: { room_id: 2, tenant_id: t2.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      await testPrisma.deposit.create({ data: { booking_id: b1.id, amount: 500000, status: "HELD" } });
      await testPrisma.deposit.create({ data: { booking_id: b2.id, amount: 700000, status: "UNPAID" } });
    }

    it("paginates and scopes deposits to the location via booking→room", async () => {
      await seedDeposits();
      expect((await getDepositsPage(1, baseParams)).total).toBe(2);
      expect((await getDepositsPage(99999, baseParams)).total).toBe(0);
    });

    it("searches by tenant name and room number", async () => {
      await seedDeposits();
      expect((await getDepositsPage(1, { ...baseParams, search: "gita" })).total).toBe(1);
      expect((await getDepositsPage(1, { ...baseParams, search: "102" })).total).toBe(1);
    });

    it("sorts by amount ascending and descending", async () => {
      await seedDeposits();
      const asc = await getDepositsPage(1, { ...baseParams, sortBy: "amount", sortDir: "asc" });
      expect(asc.rows.map((r) => Number(r.amount))).toEqual([500000, 700000]);
      const desc = await getDepositsPage(1, { ...baseParams, sortBy: "amount", sortDir: "desc" });
      expect(desc.rows.map((r) => Number(r.amount))).toEqual([700000, 500000]);
    });

    it("sorts by tenant name (relation)", async () => {
      await seedDeposits();
      const asc = await getDepositsPage(1, { ...baseParams, sortBy: "tenant", sortDir: "asc" });
      expect(asc.rows.map((r) => r.booking.tenants?.name)).toEqual(["Gita", "Hadi"]);
    });
  });

  describe("getUtilitiesPage", () => {
    async function seedReadings() {
      // Location 1 already exists with rooms 1 (101) and 2 (102). Add location 2 + a room.
      await testPrisma.location.create({ data: { id: 2, name: "Loc 2", address: "Jl. Dua" } });
      await testPrisma.room.create({
        data: { id: 3, room_number: "201", room_type_id: 1, status_id: 1, location_id: 2 },
      });
      const tLoc1 = await testPrisma.tenant.create({
        data: { name: "Indra", id_number: `id-i-${Date.now()}`, email: "i@t.com" },
      });
      const tLoc2 = await testPrisma.tenant.create({
        data: { name: "Joko", id_number: `id-j-${Date.now()}`, email: "j@t.com" },
      });
      const bLoc1 = await testPrisma.booking.create({
        data: { room_id: 1, tenant_id: tLoc1.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      const bLoc2 = await testPrisma.booking.create({
        data: { room_id: 3, tenant_id: tLoc2.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      await testPrisma.meterReading.create({
        data: { booking_id: bLoc1.id, utility_type: "electricity", reading_date: new Date("2025-01-10"), reading_value: 100, rate_per_unit: 1500 },
      });
      await testPrisma.meterReading.create({
        data: { booking_id: bLoc2.id, utility_type: "water", reading_date: new Date("2025-01-12"), reading_value: 50, rate_per_unit: 2000 },
      });
    }

    it("scopes readings to the selected location (closes the cross-location leak)", async () => {
      await seedReadings();
      const loc1 = await getUtilitiesPage(1, baseParams);
      expect(loc1.total).toBe(1);
      expect(loc1.rows[0].booking.tenants?.name).toBe("Indra");

      const loc2 = await getUtilitiesPage(2, baseParams);
      expect(loc2.total).toBe(1);
      expect(loc2.rows[0].booking.tenants?.name).toBe("Joko");
    });

    it("searches by tenant name and room number within the location", async () => {
      await seedReadings();
      expect((await getUtilitiesPage(1, { ...baseParams, search: "indra" })).total).toBe(1);
      expect((await getUtilitiesPage(1, { ...baseParams, search: "101" })).total).toBe(1);
      expect((await getUtilitiesPage(1, { ...baseParams, search: "joko" })).total).toBe(0); // other location
    });

    it("sorts by reading_value ascending and descending within the location", async () => {
      await seedReadings();
      // Add a second reading in location 1 to have something to order.
      const tenant = await testPrisma.tenant.create({
        data: { name: "Kiki", id_number: `id-k-${Date.now()}`, email: "k@t.com" },
      });
      const b = await testPrisma.booking.create({
        data: { room_id: 2, tenant_id: tenant.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
      });
      await testPrisma.meterReading.create({
        data: { booking_id: b.id, utility_type: "electricity", reading_date: new Date("2025-01-15"), reading_value: 300, rate_per_unit: 1500 },
      });
      const asc = await getUtilitiesPage(1, { ...baseParams, sortBy: "reading_value", sortDir: "asc" });
      expect(asc.rows.map((r) => Number(r.reading_value))).toEqual([100, 300]);
      const desc = await getUtilitiesPage(1, { ...baseParams, sortBy: "reading_value", sortDir: "desc" });
      expect(desc.rows.map((r) => Number(r.reading_value))).toEqual([300, 100]);
    });
  });
});
