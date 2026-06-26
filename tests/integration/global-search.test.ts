import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import { globalSearch } from "@/app/_db/search";
import type { Permission } from "@/app/_lib/rbac";

const ALL: Set<Permission> = new Set([
  "tenants.view", "bookings.view", "bills.view", "rooms.view",
]);

describe("globalSearch", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  async function seed() {
    // Location 2 + a room in it.
    await testPrisma.location.create({ data: { id: 2, name: "Loc 2", address: "Jl. Dua" } });
    await testPrisma.room.create({
      data: { id: 3, room_number: "201", room_type_id: 1, status_id: 1, location_id: 2 },
    });
    const t1 = await testPrisma.tenant.create({
      data: { name: "Budi Santoso", id_number: `id-b-${Date.now()}`, email: "budi@t.com", phone: "0811" },
    });
    const b1 = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t1.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
    });
    const bill1 = await testPrisma.bill.create({
      data: { booking_id: b1.id, description: "Sewa Januari", due_date: new Date("2025-01-28"), invoice_number: "INV-001" },
    });
    // Location 2 booking + bill (for scope tests)
    const t2 = await testPrisma.tenant.create({
      data: { name: "Citra", id_number: `id-c-${Date.now()}`, email: "citra@t.com" },
    });
    const b2 = await testPrisma.booking.create({
      data: { room_id: 3, tenant_id: t2.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
    });
    await testPrisma.bill.create({
      data: { booking_id: b2.id, description: "Sewa Loc2", due_date: new Date("2025-01-28"), invoice_number: "INV-LOC2" },
    });
    return { t1, b1, bill1 };
  }

  it("matches tenants by name/email/phone/id_number", async () => {
    await seed();
    expect((await globalSearch(null, "budi", ALL)).tenants).toHaveLength(1);
    expect((await globalSearch(null, "budi@t.com", ALL)).tenants[0].label).toBe("Budi Santoso");
    expect((await globalSearch(null, "0811", ALL)).tenants).toHaveLength(1);
  });

  it("matches rooms, bookings, and bills by their documented fields", async () => {
    await seed();
    expect((await globalSearch(null, "101", ALL)).rooms.length).toBeGreaterThanOrEqual(1);
    expect((await globalSearch(null, "INV-001", ALL)).bills).toHaveLength(1);
    // booking matched via tenant name
    expect((await globalSearch(null, "budi", ALL)).bookings.length).toBeGreaterThanOrEqual(1);
  });

  it("produces correct hrefs and tenant has null location", async () => {
    const { t1 } = await seed();
    const r = await globalSearch(null, "budi", ALL);
    const tenantHit = r.tenants[0];
    expect(tenantHit.href).toBe(`/residents/tenants/${t1.id}`);
    expect(tenantHit.locationId).toBeNull();
    const billHit = (await globalSearch(null, "INV-001", ALL)).bills[0];
    expect(billHit.href).toBe("/bills?q=INV-001");
    expect(billHit.locationName).toBe("Test Location");
  });

  it("scopes location-bound entities: excludes other locations when scope is restricted", async () => {
    await seed();
    // scope = [1] → INV-LOC2 (location 2) excluded; INV-001 (location 1) included
    const scoped = await globalSearch([1], "INV", ALL);
    expect(scoped.bills.map((b) => b.label)).toContain("INV-001");
    expect(scoped.bills.map((b) => b.label)).not.toContain("INV-LOC2");
    // null scope (admin) → both
    const all = await globalSearch(null, "INV", ALL);
    expect(all.bills.map((b) => b.label).sort()).toEqual(["INV-001", "INV-LOC2"]);
  });

  it("omits an entity group the user cannot view", async () => {
    await seed();
    const noBills: Set<Permission> = new Set(["tenants.view", "bookings.view", "rooms.view"]);
    const r = await globalSearch(null, "INV-001", noBills);
    expect(r.bills).toEqual([]);
    // a permitted group still populates
    expect((await globalSearch(null, "budi", noBills)).tenants).toHaveLength(1);
  });

  it("caps each group at 5", async () => {
    const t = await testPrisma.tenant.create({
      data: { name: "ZZ Base", id_number: `id-z-${Date.now()}`, email: "z@t.com" },
    });
    const bk = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
    });
    for (let i = 0; i < 7; i++) {
      await testPrisma.bill.create({
        data: { booking_id: bk.id, description: `Tagihan ${i}`, due_date: new Date(`2025-01-${20 + i}`), invoice_number: `INVCAP-${i}` },
      });
    }
    const r = await globalSearch(null, "INVCAP", ALL);
    expect(r.bills).toHaveLength(5);
  });

  it("returns all-empty for a blank term without querying", async () => {
    await seed();
    const r = await globalSearch(null, "   ", ALL);
    expect(r).toEqual({ tenants: [], bookings: [], bills: [], rooms: [] });
  });
});
