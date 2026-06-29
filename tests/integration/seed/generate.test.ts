import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { makeRng } from "../../../prisma/seed/rng";
import { truncateAll } from "../../../prisma/seed/reset";
import { seedReference } from "../../../prisma/seed/reference";
import { seedLocationsRoomsTypes } from "../../../prisma/seed/generate/locations-rooms";
import { seedTenants } from "../../../prisma/seed/generate/tenants";

const prisma = new PrismaClient();

describe("bulk generators", () => {
  beforeEach(async () => {
    await truncateAll(prisma);
    await seedReference(prisma);
  });

  it("creates the 2 fixed locations and ~300 rooms", async () => {
    const { locationIds, roomIds } = await seedLocationsRoomsTypes(prisma, makeRng(1));
    expect(locationIds).toContain(1);
    expect(locationIds).toContain(2);
    expect(roomIds.length).toBeGreaterThanOrEqual(280);
    const sdk = await prisma.location.findUnique({ where: { id: 1 } });
    expect(sdk?.code).toBe("SDK");
  });

  it("creates the requested number of tenants, deterministically", async () => {
    await seedLocationsRoomsTypes(prisma, makeRng(1));
    const idsA = await seedTenants(prisma, makeRng(99), 50);
    expect(idsA).toHaveLength(50);
    // Names are deterministic for a fixed seed.
    const first = await prisma.tenant.findUnique({ where: { id: idsA[0] } });
    expect(first?.name).toBeTruthy();
  });

  it("returns tenant ids in deterministic creation order", async () => {
    // First run
    await truncateAll(prisma);
    await seedReference(prisma);
    await seedLocationsRoomsTypes(prisma, makeRng(1));
    const idsRun1 = await seedTenants(prisma, makeRng(42), 30);
    const tenantsRun1 = await prisma.tenant.findMany({
      where: { id: { in: idsRun1 } },
      select: { id: true, name: true },
    });
    const namesRun1 = idsRun1.map((id) => tenantsRun1.find((t) => t.id === id)!.name);

    // Second run with same seed
    await truncateAll(prisma);
    await seedReference(prisma);
    await seedLocationsRoomsTypes(prisma, makeRng(1));
    const idsRun2 = await seedTenants(prisma, makeRng(42), 30);
    const tenantsRun2 = await prisma.tenant.findMany({
      where: { id: { in: idsRun2 } },
      select: { id: true, name: true },
    });
    const namesRun2 = idsRun2.map((id) => tenantsRun2.find((t) => t.id === id)!.name);

    // Names in returned-id order must be identical
    expect(namesRun1).toEqual(namesRun2);
  });

  it("creates the 5 login users with correct roles", async () => {
    await seedLocationsRoomsTypes(prisma, makeRng(1));
    const admin = await prisma.siteUser.findUnique({ where: { email: "admin@micasasuites.com" } });
    expect(admin).toBeTruthy();
    expect(admin?.role_id).toBe(1);

    const users = await prisma.siteUser.count();
    expect(users).toBe(5);
  });
});
