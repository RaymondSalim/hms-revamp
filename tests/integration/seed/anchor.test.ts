import { describe, it, expect, afterEach, vi } from "vitest";
import { seedNow, monthsFrom, daysFrom } from "../../../prisma/seed/anchor";

describe("seed anchor", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("seedNow reflects PREVIEW_NOW as midnight-UTC", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T09:30:00Z");
    expect(seedNow().toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("daysFrom offsets by whole days", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T00:00:00Z");
    expect(daysFrom(-5).toISOString()).toBe("2026-06-10T00:00:00.000Z");
    expect(daysFrom(10).toISOString()).toBe("2026-06-25T00:00:00.000Z");
  });

  it("monthsFrom returns first-of-month offsets", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T00:00:00Z");
    expect(monthsFrom(0).toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(monthsFrom(-2).toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(monthsFrom(3).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});
