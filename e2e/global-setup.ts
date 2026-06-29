import { execSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const ROOT = path.resolve(__dirname, "..");

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

/**
 * After seeding with explicit IDs, Postgres auto-increment sequences may be
 * behind the max id — causing unique constraint violations on the next insert.
 * This resets all serial sequences to max(id)+1.
 */
async function syncSequences(): Promise<void> {
  const prisma = new PrismaClient({
    datasources: { db: { url: E2E_DATABASE_URL } },
  });
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (
          SELECT s.relname AS seq, t.relname AS tbl, a.attname AS col
          FROM pg_class s
          JOIN pg_depend d ON d.objid = s.oid
          JOIN pg_class t ON t.oid = d.refobjid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
          WHERE s.relkind = 'S' AND t.relkind = 'r'
        ) LOOP
          EXECUTE format(
            'SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I), 0) + 1, false)',
            r.seq, r.col, r.tbl
          );
        END LOOP;
      END $$;
    `);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Mark the app as already set up. The base seed leaves APP_SETUP = "false",
 * which makes the dashboard layout redirect every authenticated route to the
 * first-time-setup wizard. E2E exercises a configured instance, so flip it on.
 */
async function markAppConfigured(): Promise<void> {
  const prisma = new PrismaClient({
    datasources: { db: { url: E2E_DATABASE_URL } },
  });
  try {
    await prisma.setting.upsert({
      where: { setting_key: "APP_SETUP" },
      update: { setting_value: "true" },
      create: { setting_key: "APP_SETUP", setting_value: "true" },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export default async function globalSetup(): Promise<void> {
  const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL };

  // 1. Push the current Prisma schema into the E2E database (idempotent).
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env,
    cwd: ROOT,
    stdio: "inherit",
  });

  // 2. Start from a clean slate so re-runs don't duplicate seed rows.
  await truncateAll();

  // 3. Seed all data (seedAll runs seedReference for admin/RBAC/settings, then
  // seedDynamic for large-scale mock data).
  execSync("npx tsx prisma/seed/index.ts", { env, cwd: ROOT, stdio: "inherit" });

  // 4. Sync auto-increment sequences to max existing id (seeds use explicit ids).
  await syncSequences();

  // 5. Treat the instance as already configured (skip the setup wizard).
  await markAppConfigured();
}
