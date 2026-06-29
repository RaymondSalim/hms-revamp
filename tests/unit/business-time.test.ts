import { describe, it, expect, vi } from "vitest";
import {
  businessToday,
  startOfUtcDay,
  utcDateParts,
  startOfUtcMonth,
  lastDayOfUtcMonth,
  daysInUtcMonth,
  addUtcMonths,
} from "@/app/_lib/util/business-time";

// These assertions must hold regardless of the host TZ env (run under TZ=UTC in
// CI and also under a non-UTC TZ locally). All helpers operate in UTC space.

describe("businessToday", () => {
  it("at 23:30 UTC the WIB day is already tomorrow", () => {
    // 2026-06-14T23:30:00Z is 2026-06-15 06:30 WIB.
    const now = new Date("2026-06-14T23:30:00Z");
    const today = businessToday(now);
    expect(today.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("at 00:30 UTC the WIB day is the same calendar day (07:30 WIB)", () => {
    const now = new Date("2026-06-15T00:30:00Z");
    expect(businessToday(now).toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("crosses a month boundary in WIB before UTC does", () => {
    // 2026-06-30T20:00Z is 2026-07-01 03:00 WIB → July 1 in business time.
    const now = new Date("2026-06-30T20:00:00Z");
    expect(businessToday(now).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("argless businessToday() reflects a frozen PREVIEW_NOW", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T03:00:00Z"); // 10:00 WIB → business day 2026-06-15
    try {
      // 03:00Z + 7h = 10:00 WIB on the 15th.
      expect(businessToday().toISOString()).toBe("2026-06-15T00:00:00.000Z");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("startOfUtcDay / utcDateParts", () => {
  it("strips time to midnight UTC", () => {
    const d = new Date("2026-06-15T13:45:00Z");
    expect(startOfUtcDay(d).toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("reads calendar parts of a midnight-UTC @db.Date", () => {
    const d = new Date("2026-06-15T00:00:00Z");
    expect(utcDateParts(d)).toEqual({ year: 2026, month: 5, day: 15 });
  });
});

describe("month helpers", () => {
  it("startOfUtcMonth", () => {
    expect(startOfUtcMonth(new Date("2026-06-15T00:00:00Z")).toISOString()).toBe(
      "2026-06-01T00:00:00.000Z"
    );
  });

  it("lastDayOfUtcMonth handles 30/31/Feb", () => {
    expect(lastDayOfUtcMonth(new Date("2026-06-10T00:00:00Z")).toISOString()).toBe(
      "2026-06-30T00:00:00.000Z"
    );
    expect(lastDayOfUtcMonth(new Date("2026-07-10T00:00:00Z")).toISOString()).toBe(
      "2026-07-31T00:00:00.000Z"
    );
    expect(lastDayOfUtcMonth(new Date("2024-02-10T00:00:00Z")).toISOString()).toBe(
      "2024-02-29T00:00:00.000Z"
    );
  });

  it("daysInUtcMonth", () => {
    expect(daysInUtcMonth(new Date("2026-06-10T00:00:00Z"))).toBe(30);
    expect(daysInUtcMonth(new Date("2026-02-10T00:00:00Z"))).toBe(28);
    expect(daysInUtcMonth(new Date("2024-02-10T00:00:00Z"))).toBe(29);
  });

  it("addUtcMonths clamps to last day of shorter target month", () => {
    // Jan 31 + 1 month → Feb 28 (2026 not a leap year).
    expect(addUtcMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z"
    );
    expect(addUtcMonths(new Date("2026-06-15T00:00:00Z"), 2).toISOString()).toBe(
      "2026-08-15T00:00:00.000Z"
    );
  });
});
