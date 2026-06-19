import { PrismaClient } from "@prisma/client";
import { seedRbac } from "./seed-rbac";

const prisma = new PrismaClient();

/**
 * Re-sync only roles, permissions, and role→permission grants. Safe to run
 * against production data — it does not touch users, settings, or business
 * records. Use this to repair missing grants (e.g. locations.*) on an existing
 * database without re-running the full seed.
 */
seedRbac(prisma)
  .then(async () => {
    console.log("RBAC roles + permissions synced.");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
