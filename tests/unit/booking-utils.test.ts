import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getLastDateOfBooking, isBookingActive } from "@/app/_lib/util/booking";

describe("getLastDateOfBooking", () => {
  it("start on 1st of month: Jan 1 + 6 months = June 30", () => {
    const start = new Date(2025, 0, 1); // Jan 1 2025
    const result = getLastDateOfBooking(start, 6);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(5); // June
    expect(result.getDate()).toBe(30);
  });

  it("start NOT on 1st: Jan 15 + 6 months = July 31", () => {
    const start = new Date(2025, 0, 15); // Jan 15 2025
    const result = getLastDateOfBooking(start, 6);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(6); // July
    expect(result.getDate()).toBe(31);
  });

  it("start on 1st + 1 month = Jan 31", () => {
    const start = new Date(2025, 0, 1); // Jan 1 2025
    const result = getLastDateOfBooking(start, 1);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(31);
  });

  it("start on Feb 1 + 1 month = Feb 28 (non-leap year)", () => {
    const start = new Date(2025, 1, 1); // Feb 1 2025 (non-leap)
    const result = getLastDateOfBooking(start, 1);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(28);
  });

  it("start on Feb 1 + 1 month = Feb 29 (leap year)", () => {
    const start = new Date(2024, 1, 1); // Feb 1 2024 (leap year)
    const result = getLastDateOfBooking(start, 1);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(29);
  });

  it("start on Mar 15 + 12 months = March 31 next year", () => {
    const start = new Date(2025, 2, 15); // Mar 15 2025
    const result = getLastDateOfBooking(start, 12);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2); // March
    expect(result.getDate()).toBe(31);
  });
});

describe("isBookingActive", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 1)); // June 1 2025
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rolling, no end_date, started in past -> true", () => {
    const booking = {
      start_date: new Date(2025, 0, 1),
      end_date: null,
      is_rolling: true,
    };
    expect(isBookingActive(booking)).toBe(true);
  });

  it("rolling, no end_date, starts in future -> false", () => {
    const booking = {
      start_date: new Date(2025, 7, 1), // Aug 1 2025
      end_date: null,
      is_rolling: true,
    };
    expect(isBookingActive(booking)).toBe(false);
  });

  it("rolling, has end_date (ended) -> false", () => {
    const booking = {
      start_date: new Date(2025, 0, 1),
      end_date: new Date(2025, 4, 31), // May 31 2025 (before today)
      is_rolling: true,
    };
    expect(isBookingActive(booking)).toBe(false);
  });

  it("fixed, within range -> true", () => {
    const booking = {
      start_date: new Date(2025, 0, 1),
      end_date: new Date(2025, 11, 31), // Dec 31 2025
      is_rolling: false,
    };
    expect(isBookingActive(booking)).toBe(true);
  });

  it("fixed, past end_date -> false", () => {
    const booking = {
      start_date: new Date(2024, 0, 1),
      end_date: new Date(2024, 11, 31), // Dec 31 2024 (past)
      is_rolling: false,
    };
    expect(isBookingActive(booking)).toBe(false);
  });

  it("fixed, not started -> false", () => {
    const booking = {
      start_date: new Date(2025, 7, 1), // Aug 1 2025
      end_date: new Date(2026, 0, 31),
      is_rolling: false,
    };
    expect(isBookingActive(booking)).toBe(false);
  });
});
