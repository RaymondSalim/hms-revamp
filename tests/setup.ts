import { execSync } from "child_process";
import { beforeAll } from "vitest";

// Use test database
process.env.DATABASE_URL = "postgresql://test:test@localhost:5433/hms_test";
(process.env as Record<string, string>).NODE_ENV = "test";

beforeAll(async () => {
  // Only push schema if running integration tests (DB available)
  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      stdio: "pipe",
    });
  } catch {
    // DB not available — unit tests will still run fine
  }
});
