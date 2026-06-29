import { describe, it, expect, afterEach, vi } from "vitest";
import { assertSeedAllowed } from "../../../prisma/seed/reset";

describe("assertSeedAllowed", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows in non-production", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(() => assertSeedAllowed()).not.toThrow();
  });

  it("throws in production without SEED_FORCE", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SEED_FORCE", undefined);
    expect(() => assertSeedAllowed()).toThrow(/production/i);
  });

  it("allows in production WITH SEED_FORCE=true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SEED_FORCE", "true");
    expect(() => assertSeedAllowed()).not.toThrow();
  });
});
