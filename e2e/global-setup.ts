import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const E2E_DATABASE_URL = "postgresql://e2e:e2e@localhost:5434/hms_e2e";

/**
 * Truncate every table so the seed scripts (which use createMany without
 * clearing) run clean and stay idempotent across runs. Mirrors the integration
 * suite's cleanDatabase() helper in tests/helpers/prisma.ts.
 */
async function truncateAll(): Promise<void> {
  const prisma = new PrismaClient({
    datasources: { db: { url: E2E_DATABASE_URL } },
  });
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
        END LOOP;
      END $$;
    `);
  } finally {
    await prisma.$disconnect();
  }
}

export default async function globalSetup(): Promise<void> {
  const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL };

  // 1. Push the current Prisma schema into the E2E database (idempotent).
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env,
    stdio: "inherit",
  });

  // 2. Start from a clean slate so re-runs don't duplicate seed rows.
  await truncateAll();

  // 3. Seed base data (admin user, RBAC, settings) then mock data.
  execSync("npx tsx prisma/seed.ts", { env, stdio: "inherit" });
  execSync("npx tsx prisma/seed-mock.ts", { env, stdio: "inherit" });
}
