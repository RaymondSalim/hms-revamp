import { describe, it, expect, beforeEach, vi } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

// Mock auth to return a known user
vi.mock("@/app/_lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: "test-user-id", name: "Test", email: "test@test.com" },
  }),
}));

import { logAudit } from "@/app/_lib/audit";

describe("Audit Trail", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();

    // Create the test user
    await testPrisma.siteUser.upsert({
      where: { id: "test-user-id" },
      update: {},
      create: {
        id: "test-user-id",
        name: "Test User",
        email: "audit@test.com",
        password: "hashed",
      },
    });
  });

  it("should create a log entry with action and user", async () => {
    await logAudit("payment.created: id=1, amount=3000000, booking_id=1");

    const logs = await testPrisma.log.findMany({
      where: { site_user_id: "test-user-id" },
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].action).toContain("payment.created");
    expect(logs[0].site_user_id).toBe("test-user-id");
  });

  it("should not throw when auth returns no user", async () => {
    const { auth } = await import("@/app/_lib/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    // Should not throw
    await logAudit("test.action");

    const logs = await testPrisma.log.findMany({
      where: { site_user_id: "test-user-id" },
    });
    expect(logs).toHaveLength(0);
  });
});
