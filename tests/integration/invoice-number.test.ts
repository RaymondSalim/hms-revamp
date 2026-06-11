import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import {
  generateInvoiceNumber,
  assignInvoiceNumber,
} from "@/app/_lib/util/invoice-number";
import { upsertBookingAction } from "@/app/(internal)/(dashboard_layout)/bookings/booking-action";

describe("Invoice Numbering", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  describe("generateInvoiceNumber", () => {
    it("increments sequentially within the same month", async () => {
      const loc = await testPrisma.location.create({
        data: { name: "Loc A", address: "Addr A", code: "JKT" },
      });
      const date = new Date("2026-03-15");

      const first = await generateInvoiceNumber(loc.id, date);
      const second = await generateInvoiceNumber(loc.id, date);

      expect(first).toBe(`INV/JKT/2026/03/0001`);
      expect(second).toBe(`INV/JKT/2026/03/0002`);
    });

    it("formats as INV/{CODE}/{YYYY}/{MM}/0001 for a known date", async () => {
      const loc = await testPrisma.location.create({
        data: { name: "Loc B", address: "Addr B", code: "BDG" },
      });

      const result = await generateInvoiceNumber(loc.id, new Date("2026-07-01"));
      expect(result).toBe("INV/BDG/2026/07/0001");
    });

    it("resets to 0001 in a different month", async () => {
      const loc = await testPrisma.location.create({
        data: { name: "Loc C", address: "Addr C", code: "SBY" },
      });

      const march = await generateInvoiceNumber(loc.id, new Date("2026-03-10"));
      const aprilFirst = await generateInvoiceNumber(
        loc.id,
        new Date("2026-04-10")
      );
      const aprilSecond = await generateInvoiceNumber(
        loc.id,
        new Date("2026-04-20")
      );

      expect(march).toBe("INV/SBY/2026/03/0001");
      expect(aprilFirst).toBe("INV/SBY/2026/04/0001");
      expect(aprilSecond).toBe("INV/SBY/2026/04/0002");
    });

    it("falls back to LOC{id} when location code is null/empty", async () => {
      const loc = await testPrisma.location.create({
        data: { name: "Loc D", address: "Addr D" },
      });

      const result = await generateInvoiceNumber(loc.id, new Date("2026-05-01"));
      expect(result).toBe(`INV/LOC${loc.id}/2026/05/0001`);
    });
  });

  describe("assignInvoiceNumber", () => {
    it("skips assignment when locationId is null", async () => {
      const tenant = await testPrisma.tenant.create({
        data: { name: "T", id_number: "X1" },
      });
      const booking = await testPrisma.booking.create({
        data: {
          room_id: 1,
          start_date: new Date("2026-02-01"),
          fee: 1000000,
          tenant_id: tenant.id,
          is_rolling: false,
        },
      });
      const bill = await testPrisma.bill.create({
        data: {
          booking_id: booking.id,
          description: "Test",
          due_date: new Date("2026-02-28"),
        },
      });

      await assignInvoiceNumber(bill.id, null, new Date("2026-02-01"));

      const refreshed = await testPrisma.bill.findUnique({
        where: { id: bill.id },
      });
      expect(refreshed?.invoice_number).toBeNull();
    });
  });

  describe("bill generation wiring", () => {
    it("assigns a non-null invoice_number to generated bills when the room has a location", async () => {
      // seedTestData seeds location id=1 (no code) and rooms with location_id=1.
      await testPrisma.location.update({
        where: { id: 1 },
        data: { code: "HQ" },
      });

      const tenant = await testPrisma.tenant.create({
        data: { name: "Booking Tenant", id_number: "ID-001" },
      });

      const result = await upsertBookingAction({
        room_id: 1,
        start_date: new Date("2026-06-01"),
        duration_id: 1, // 1 Bulan
        fee: 2000000,
        tenant_id: tenant.id,
        is_rolling: false,
        status_id: 2,
      });
      expect(result.success).toBe(true);

      const booking = await testPrisma.booking.findFirst({
        where: { tenant_id: tenant.id },
        include: { bills: true },
      });
      expect(booking).not.toBeNull();
      expect(booking!.bills.length).toBeGreaterThan(0);
      for (const bill of booking!.bills) {
        expect(bill.invoice_number).not.toBeNull();
        expect(bill.invoice_number).toMatch(/^INV\/HQ\/2026\/06\/\d{4}$/);
      }
    });
  });
});
