import { describe, it, expect } from "vitest";
import { prorateFromStartDay, roundMoney } from "@/app/_lib/util/money";

/**
 * Proration helper used in booking-action.ts:
 *   prorateFromStartDay(amount, startDay, daysInMonth)
 *     = round(((daysInMonth - startDay + 1) / daysInMonth) * amount)
 *
 * Represents the fraction of the month remaining from startDay through end of
 * month, rounded to whole rupiah (IDR has no sub-unit).
 */
describe("prorateFromStartDay", () => {
  it("start Jan 15, fee=3000000: round((31-15+1)/31 * 3000000)", () => {
    // (17/31) * 3000000 = 1645161.29 -> 1645161
    expect(prorateFromStartDay(3000000, 15, 31)).toBe(1645161);
  });

  it("start day 1: returns the full amount (no proration loss)", () => {
    expect(prorateFromStartDay(3000000, 1, 31)).toBe(3000000);
  });

  it("start Feb 15 (non-leap, 28 days): exact half", () => {
    expect(prorateFromStartDay(2000000, 15, 28)).toBe(1000000);
  });

  it("start Mar 31: round((1/31) * 1000000) = 32258", () => {
    // 32258.06... -> 32258
    expect(prorateFromStartDay(1000000, 31, 31)).toBe(32258);
  });

  it("start on last day of Feb (non-leap): one day's worth", () => {
    expect(prorateFromStartDay(2800000, 28, 28)).toBe(100000);
  });

  it("start mid-month Apr 10, fee=900000: (21/30) * 900000 = 630000", () => {
    expect(prorateFromStartDay(900000, 10, 30)).toBe(630000);
  });

  it("start Feb 15 in leap year (29 days): round((15/29) * 2900000)", () => {
    // 1500000 exactly
    expect(prorateFromStartDay(2900000, 15, 29)).toBe(1500000);
  });

  it("rounds half up", () => {
    expect(roundMoney(0.5)).toBe(1);
    expect(roundMoney(1.4)).toBe(1);
    expect(roundMoney(1.6)).toBe(2);
  });
});
