import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getLastDateOfBooking, isBookingActive } from "@/app/_lib/util/booking";

// start_date/end_date model Prisma @db.Date values, which are midnight-UTC. Build
// inputs with Date.UTC and assert with getUTC* so the tests are independent of
// the host timezone (CI runs TZ=UTC; these must also hold under non-UTC TZ).

describe("getLastDateOfBooking", () => {
  it("start on 1st of month: Jan 1 + 6 months = June 30", () => {
    const start = new Date(Date.UTC(2025, 0, 1)); // Jan 1 2025
    const result = getLastDateOfBooking(start, 6);
    expect(result.getUTCFullYear()).toBe(2025);
    expect(result.getUTCMonth()).toBe(5); // June
    expect(result.getUTCDate()).toBe(30);
  });

  it("start NOT on 1st: Jan 15 + 6 months = July 31", () => {
    const start = new Date(Date.UTC(2025, 0, 15)); // Jan 15 2025
    const result = getLastDateOfBooking(start, 6);
    expect(result.getUTCFullYear()).toBe(2025);
    expect(result.getUTCMonth()).toBe(6); // July
    expect(result.getUTCDate()).toBe(31);
  });

  it("start on 1st + 1 month = Jan 31", () => {
    const start = new Date(Date.UTC(2025, 0, 1)); // Jan 1 2025
    const result = getLastDateOfBooking(start, 1);
    expect(result.getUTCFullYear()).toBe(2025);
    expect(result.getUTCMonth()).toBe(0); // January
    expect(result.getUTCDate()).toBe(31);
  });

  it("start on Feb 1 + 1 month = Feb 28 (non-leap year)", () => {
    const start = new Date(Date.UTC(2025, 1, 1)); // Feb 1 2025 (non-leap)
    const result = getLastDateOfBooking(start, 1);
    expect(result.getUTCFullYear()).toBe(2025);
    expect(result.getUTCMonth()).toBe(1); // February
    expect(result.getUTCDate()).toBe(28);
  });

  it("start on Feb 1 + 1 month = Feb 29 (leap year)", () => {
    const start = new Date(Date.UTC(2024, 1, 1)); // Feb 1 2024 (leap year)
    const result = getLastDateOfBooking(start, 1);
    expect(result.getUTCFullYear()).toBe(2024);
    expect(result.getUTCMonth()).toBe(1); // February
    expect(result.getUTCDate()).toBe(29);
  });

  it("start on Mar 15 + 12 months = March 31 next year", () => {
    const start = new Date(Date.UTC(2025, 2, 15)); // Mar 15 2025
    const result = getLastDateOfBooking(start, 12);
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(2); // March
    expect(result.getUTCDate()).toBe(31);
  });
});

describe("isBookingActive", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mid-day UTC instant so the WIB business day is unambiguously 2025-06-01.
    vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rolling, no end_date, started in past -> true", () => {
    const booking = {
      start_date: new Date(Date.UTC(2025, 0, 1)),
      end_date: null,
      is_rolling: true,
    };
    expect(isBookingActive(booking)).toBe(true);
  });

  it("rolling, no end_date, starts in future -> false", () => {
    const booking = {
      start_date: new Date(Date.UTC(2025, 7, 1)), // Aug 1 2025
      end_date: null,
      is_rolling: true,
    };
    expect(isBookingActive(booking)).toBe(false);
  });

  it("rolling, has end_date (ended) -> false", () => {
    const booking = {
      start_date: new Date(Date.UTC(2025, 0, 1)),
      end_date: new Date(Date.UTC(2025, 4, 31)), // May 31 2025 (before today)
      is_rolling: true,
    };
    expect(isBookingActive(booking)).toBe(false);
  });

  it("fixed, within range -> true", () => {
    const booking = {
      start_date: new Date(Date.UTC(2025, 0, 1)),
      end_date: new Date(Date.UTC(2025, 11, 31)), // Dec 31 2025
      is_rolling: false,
    };
    expect(isBookingActive(booking)).toBe(true);
  });

  it("fixed, past end_date -> false", () => {
    const booking = {
      start_date: new Date(Date.UTC(2024, 0, 1)),
      end_date: new Date(Date.UTC(2024, 11, 31)), // Dec 31 2024 (past)
      is_rolling: false,
    };
    expect(isBookingActive(booking)).toBe(false);
  });

  it("fixed, not started -> false", () => {
    const booking = {
      start_date: new Date(Date.UTC(2025, 7, 1)), // Aug 1 2025
      end_date: new Date(Date.UTC(2026, 0, 31)),
      is_rolling: false,
    };
    expect(isBookingActive(booking)).toBe(false);
  });
});
