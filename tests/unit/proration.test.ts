import { describe, it, expect } from "vitest";

/**
 * Proration formula used in booking-action.ts:
 *   proratedFee = ((daysInMonth - startDay + 1) / daysInMonth) * fee
 *
 * This represents the fraction of the month remaining from startDay through end of month.
 * We recreate the formula here to test the math in isolation.
 */
function calculateProratedFee(startDay: number, daysInMonth: number, fee: number): number {
  return ((daysInMonth - startDay + 1) / daysInMonth) * fee;
}

describe("proration formula", () => {
  it("start Jan 15, fee=3000000: (31-15+1)/31 * 3000000", () => {
    const result = calculateProratedFee(15, 31, 3000000);
    const expected = (17 / 31) * 3000000; // ~1645161.29
    expect(result).toBeCloseTo(expected, 2);
    expect(result).toBeCloseTo(1645161.29, 0);
  });

  it("start Jan 1: full month (should NOT prorate in practice, but formula gives full fee)", () => {
    const result = calculateProratedFee(1, 31, 3000000);
    // (31 - 1 + 1) / 31 = 31/31 = 1.0
    expect(result).toBe(3000000);
  });

  it("start Feb 15, fee=2000000 (non-leap, 28 days): (28-15+1)/28 * 2000000 = 1000000", () => {
    const result = calculateProratedFee(15, 28, 2000000);
    const expected = (14 / 28) * 2000000;
    expect(result).toBe(1000000);
  });

  it("start Mar 31, fee=1000000: (31-31+1)/31 * 1000000 = 32258.06...", () => {
    const result = calculateProratedFee(31, 31, 1000000);
    const expected = (1 / 31) * 1000000;
    expect(result).toBeCloseTo(expected, 2);
    expect(result).toBeCloseTo(32258.06, 0);
  });

  it("start on last day of Feb (non-leap): (28-28+1)/28 * fee", () => {
    const result = calculateProratedFee(28, 28, 2800000);
    const expected = (1 / 28) * 2800000;
    expect(result).toBe(100000);
  });

  it("start mid-month Apr 10, fee=900000: (30-10+1)/30 * 900000", () => {
    const result = calculateProratedFee(10, 30, 900000);
    const expected = (21 / 30) * 900000;
    expect(result).toBeCloseTo(expected, 2);
    expect(result).toBeCloseTo(630000, 2);
  });

  it("start Feb 15 in leap year (29 days), fee=2900000: (29-15+1)/29 * 2900000", () => {
    const result = calculateProratedFee(15, 29, 2900000);
    const expected = (15 / 29) * 2900000;
    expect(result).toBeCloseTo(expected, 2);
    expect(result).toBeCloseTo(1500000, 0);
  });
});
