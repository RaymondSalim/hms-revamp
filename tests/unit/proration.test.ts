import { describe, it, expect } from "vitest";
import {
  prorateFromStartDay,
  roundMoney,
  applyRateEscalation,
} from "@/app/_lib/util/money";

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

describe("applyRateEscalation", () => {
  it("returns base amount when no escalation configured", () => {
    expect(applyRateEscalation(1000000, 24, 0, 12)).toBe(1000000);
    expect(applyRateEscalation(1000000, 24, 10, null)).toBe(1000000);
    expect(applyRateEscalation(1000000, 24, 10, 0)).toBe(1000000);
  });

  it("does not escalate before the first frequency boundary", () => {
    // frequency 12: months 0..11 are step 0
    expect(applyRateEscalation(1000000, 0, 10, 12)).toBe(1000000);
    expect(applyRateEscalation(1000000, 11, 10, 12)).toBe(1000000);
  });

  it("steps up by percentage each frequency window (compounding)", () => {
    // month 12 -> 1 step: 1,000,000 * 1.10 = 1,100,000
    expect(applyRateEscalation(1000000, 12, 10, 12)).toBe(1100000);
    // month 24 -> 2 steps: 1,000,000 * 1.10^2 = 1,210,000
    expect(applyRateEscalation(1000000, 24, 10, 12)).toBe(1210000);
  });

  it("supports a 6-month escalation frequency", () => {
    // month 6 -> 1 step at 5%: 2,000,000 * 1.05 = 2,100,000
    expect(applyRateEscalation(2000000, 6, 5, 6)).toBe(2100000);
    // month 13 -> 2 steps: 2,000,000 * 1.05^2 = 2,205,000
    expect(applyRateEscalation(2000000, 13, 5, 6)).toBe(2205000);
  });

  it("rounds the escalated amount to whole rupiah", () => {
    // 1,000,000 * 1.075 = 1,075,000 exactly; use a rate that needs rounding
    // month 12 -> 1 step at 3.33%: 1,000,000 * 1.0333 = 1,033,300
    expect(applyRateEscalation(1000000, 12, 3.33, 12)).toBe(1033300);
  });
});
