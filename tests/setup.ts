import { execSync } from "child_process";
import { beforeAll, afterAll } from "vitest";

// Use test database
process.env.DATABASE_URL = "postgresql://test:test@localhost:5433/hms_test";
// Suppress Next.js server action warnings in test
process.env.NODE_ENV = "test";

beforeAll(async () => {
  // Push schema to test DB (fast, no migrations needed)
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: "pipe",
  });
});
