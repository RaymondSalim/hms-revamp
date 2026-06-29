import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "../../helpers/mock-next";
import { PrismaClient } from "@prisma/client";
import { seedAll } from "../../../prisma/seed/index";
import { PAYMENT_STATUS } from "@/app/_lib/util/status";

const prisma = new PrismaClient();

describe("full seed pipeline", () => {
  beforeEach(() => vi.stubEnv("PREVIEW_NOW", "2026-06-15T00:00:00Z"));
  afterEach(() => vi.unstubAllEnvs());

  it("seeds the full dataset with the anchor matrix and real-derived financials", async () => {
    await seedAll(prisma, { tenants: 120, rngSeed: 7 }); // smaller count for test speed

    const tenants = await prisma.tenant.count();
    expect(tenants).toBeGreaterThanOrEqual(120);
    expect(await prisma.room.count()).toBeGreaterThanOrEqual(280);

    // anchor matrix present
    expect(await prisma.tenant.findFirst({ where: { name: "Ahmad Wijaya" } })).toBeTruthy();
    expect(await prisma.bill.findFirst({ where: { invoice_number: { startsWith: "INV/SDK" } } })).toBeTruthy();
    expect(await prisma.payment.findFirst({
      where: { status_id: PAYMENT_STATUS.PENDING, bookings: { rooms: { location_id: 1 } } },
    })).toBeTruthy();
    expect(await prisma.penalty.count()).toBeGreaterThan(0);
  });

  it("is deterministic: two runs produce identical invoice numbers per booking", async () => {
    await seedAll(prisma, { tenants: 60, rngSeed: 7 });
    const run1 = await prisma.bill.findMany({
      where: { invoice_number: { not: null } },
      select: { booking_id: true, invoice_number: true },
      orderBy: [{ booking_id: "asc" }, { invoice_number: "asc" }],
    });

    await seedAll(prisma, { tenants: 60, rngSeed: 7 }); // re-seed (truncates first)
    const run2 = await prisma.bill.findMany({
      where: { invoice_number: { not: null } },
      select: { booking_id: true, invoice_number: true },
      orderBy: [{ booking_id: "asc" }, { invoice_number: "asc" }],
    });

    expect(run2).toEqual(run1);
  });
});
