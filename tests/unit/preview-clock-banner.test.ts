import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isPreviewClockEnabled } from "@/app/_lib/util/clock";

describe("banner gating predicate", () => {
  beforeEach(() => {
    vi.stubEnv("PREVIEW_NOW", undefined);
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("PREVIEW_CLOCK_ENABLED", undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("banner hidden when clock not frozen", () => {
    expect(isPreviewClockEnabled()).toBe(false);
  });

  it("banner shown when frozen + allowed", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T03:00:00Z");
    expect(isPreviewClockEnabled()).toBe(true);
  });

  it("banner hidden in production even if PREVIEW_NOW set", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T03:00:00Z");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isPreviewClockEnabled()).toBe(false);
  });
});
