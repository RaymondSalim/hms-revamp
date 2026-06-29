import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import { getUpcomingEvents } from "@/app/_db/dashboard";

// dashboard.getUpcomingEvents filters `start >= now`. With the clock frozen to a
// past instant, an event in the frozen-future must be INCLUDED even if it is in
// the real-world past.
describe("preview clock propagates to dashboard upcoming-events cutoff", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
    vi.stubEnv("PREVIEW_NOW", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("includes an event after the frozen now but before real now", async () => {
    // Freeze to 2020-01-01. An event dated 2020-06-01 is in the frozen-future
    // (so it should appear) but in the real-world past (so without the clock it
    // would be filtered out).
    vi.stubEnv("PREVIEW_NOW", "2020-01-01T00:00:00Z");
    await testPrisma.event.create({
      data: { title: "Frozen-future event", start: new Date("2020-06-01T00:00:00Z") },
    });

    const events = await getUpcomingEvents();
    expect(events.some((e) => e.title === "Frozen-future event")).toBe(true);
  });

  it("excludes that same event when the clock is NOT frozen", async () => {
    // PREVIEW_NOW already unset by beforeEach.
    await testPrisma.event.create({
      data: { title: "Real-past event", start: new Date("2020-06-01T00:00:00Z") },
    });
    const events = await getUpcomingEvents();
    expect(events.some((e) => e.title === "Real-past event")).toBe(false);
  });
});
