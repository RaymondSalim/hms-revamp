import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { now, isPreviewClockAllowed, isPreviewClockEnabled } from "@/app/_lib/util/clock";

// Use vi.stubEnv (NOT direct process.env mutation): it handles NODE_ENV (which
// can be read-only in some setups) correctly and is reset by unstubAllEnvs.
// vi.stubEnv(key, undefined) deletes the var. By default vitest sets NODE_ENV
// to "test", so a clean slate already satisfies isPreviewClockAllowed().
describe("clock.now / preview-clock gates", () => {
  beforeEach(() => {
    vi.stubEnv("PREVIEW_NOW", undefined);
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("PREVIEW_CLOCK_ENABLED", undefined);
    // leave NODE_ENV as vitest's default ("test")
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns real time when PREVIEW_NOW is unset", () => {
    const before = Date.now();
    const t = now().getTime();
    const after = Date.now();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
    expect(isPreviewClockEnabled()).toBe(false);
  });

  it("returns the frozen instant when PREVIEW_NOW is set and allowed", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T03:00:00Z");
    expect(now().toISOString()).toBe("2026-06-15T03:00:00.000Z");
    expect(isPreviewClockEnabled()).toBe(true);
  });

  it("REFUSES on Vercel production even with PREVIEW_NOW set", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T03:00:00Z");
    vi.stubEnv("VERCEL_ENV", "production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const before = Date.now();
    const t = now().getTime();
    expect(t).toBeGreaterThanOrEqual(before);   // real time, not frozen
    expect(isPreviewClockAllowed()).toBe(false);
    expect(isPreviewClockEnabled()).toBe(false);
    expect(spy).toHaveBeenCalled();
  });

  it("REFUSES on NODE_ENV=production without the explicit opt-in", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T03:00:00Z");
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isPreviewClockAllowed()).toBe(false);
    const before = Date.now();
    expect(now().getTime()).toBeGreaterThanOrEqual(before);
  });

  it("ALLOWS on NODE_ENV=production WITH the explicit opt-in", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T03:00:00Z");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PREVIEW_CLOCK_ENABLED", "true");
    expect(isPreviewClockAllowed()).toBe(true);
    expect(now().toISOString()).toBe("2026-06-15T03:00:00.000Z");
  });

  it("the opt-in does NOT override Vercel production", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T03:00:00Z");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("PREVIEW_CLOCK_ENABLED", "true");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isPreviewClockAllowed()).toBe(false);
  });

  it("falls back to real time + logs on an unparseable PREVIEW_NOW", () => {
    vi.stubEnv("PREVIEW_NOW", "not-a-date");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const before = Date.now();
    expect(now().getTime()).toBeGreaterThanOrEqual(before);
    expect(isPreviewClockEnabled()).toBe(false);
    expect(spy).toHaveBeenCalled();
  });
});
