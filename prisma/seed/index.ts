import { PrismaClient } from "@prisma/client";
import { fileURLToPath } from "node:url";
import { assertSeedAllowed, truncateAll } from "./reset";
import { seedReference } from "./reference";
import { seedLocationsRoomsTypes } from "./generate/locations-rooms";
import { seedTenants } from "./generate/tenants";
import { seedAnchorFixtures } from "./fixtures";
import { seedBulkBookings } from "./generate/bookings";
import { deriveFinancials } from "./derive";
import { makeRng } from "./rng";

interface SeedOptions {
  tenants?: number;     // default 1000
  rngSeed?: number;     // default makeRng() default
}

export async function seedAll(prisma: PrismaClient, opts: SeedOptions = {}): Promise<void> {
  const tenantCount = opts.tenants ?? (process.env.SEED_TENANTS ? Number(process.env.SEED_TENANTS) : 1000);
  const seed = opts.rngSeed ?? (process.env.SEED_RNG_SEED ? Number(process.env.SEED_RNG_SEED) : undefined);
  const rng = makeRng(seed);

  await truncateAll(prisma);
  console.log("[seed] reference data…");
  await seedReference(prisma);
  console.log("[seed] locations + rooms…");
  const ctx = await seedLocationsRoomsTypes(prisma, rng);
  console.log("[seed] tenants…");
  const tenantIds = await seedTenants(prisma, rng, tenantCount);
  console.log("[seed] anchor fixtures…");
  const anchorSpecs = await seedAnchorFixtures(prisma, ctx);
  console.log("[seed] bulk bookings…");
  const bulkSpecs = await seedBulkBookings(prisma, rng, ctx, tenantIds);
  console.log("[seed] deriving financials via real services…");
  await deriveFinancials(prisma, rng, [...anchorSpecs, ...bulkSpecs]);
  console.log("[seed] done.");
}

async function main() {
  assertSeedAllowed();
  const prisma = new PrismaClient();
  try {
    await seedAll(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// Run when invoked directly (tsx prisma/seed/index.ts).
const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntry) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
