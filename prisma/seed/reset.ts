import { PrismaClient } from "@prisma/client";

/** Guard: refuse to run a destructive seed against production unless forced. */
export function assertSeedAllowed(): void {
  if (process.env.NODE_ENV === "production" && process.env.SEED_FORCE !== "true") {
    throw new Error(
      "Refusing to seed: NODE_ENV=production. Set SEED_FORCE=true to override."
    );
  }
}

/**
 * Truncate every table in the public schema (except Prisma's migration table),
 * resetting identity sequences. Same approach as tests/helpers/prisma.ts, but
 * seed-local so prisma/seed/ never imports from tests/.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN (
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      ) LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;
  `);
}
