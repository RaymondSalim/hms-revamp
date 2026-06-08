import { describe, it, expect } from "vitest";
import { getAddonChargeForMonth } from "@/app/_lib/util/billing";

describe("getAddonChargeForMonth", () => {
  it("single tier covers all months - returns tier price each month", () => {
    const pricing = [
      { interval_start: 0, interval_end: null, price: 150000, is_full_payment: false },
    ];
    expect(getAddonChargeForMonth(pricing, 0)).toBe(150000);
    expect(getAddonChargeForMonth(pricing, 5)).toBe(150000);
    expect(getAddonChargeForMonth(pricing, 11)).toBe(150000);
  });

  it("multiple tiers: month 0-2 = 100, month 3+ = 80 - correct switch at month 3", () => {
    const pricing = [
      { interval_start: 0, interval_end: 2, price: 100, is_full_payment: false },
      { interval_start: 3, interval_end: null, price: 80, is_full_payment: false },
    ];
    expect(getAddonChargeForMonth(pricing, 0)).toBe(100);
    expect(getAddonChargeForMonth(pricing, 1)).toBe(100);
    expect(getAddonChargeForMonth(pricing, 2)).toBe(100);
    expect(getAddonChargeForMonth(pricing, 3)).toBe(80);
    expect(getAddonChargeForMonth(pricing, 10)).toBe(80);
  });

  it("is_full_payment=true: only charges on interval_start month, 0 on subsequent", () => {
    const pricing = [
      { interval_start: 0, interval_end: null, price: 500000, is_full_payment: true },
    ];
    expect(getAddonChargeForMonth(pricing, 0)).toBe(500000);
    expect(getAddonChargeForMonth(pricing, 1)).toBe(0);
    expect(getAddonChargeForMonth(pricing, 5)).toBe(0);
  });

  it("no matching tier - returns 0", () => {
    const pricing = [
      { interval_start: 3, interval_end: 5, price: 200, is_full_payment: false },
    ];
    expect(getAddonChargeForMonth(pricing, 0)).toBe(0);
    expect(getAddonChargeForMonth(pricing, 1)).toBe(0);
    expect(getAddonChargeForMonth(pricing, 6)).toBe(0);
  });

  it("tier with interval_end=null (open-ended) - matches all months >= interval_start", () => {
    const pricing = [
      { interval_start: 2, interval_end: null, price: 75000, is_full_payment: false },
    ];
    expect(getAddonChargeForMonth(pricing, 0)).toBe(0);
    expect(getAddonChargeForMonth(pricing, 1)).toBe(0);
    expect(getAddonChargeForMonth(pricing, 2)).toBe(75000);
    expect(getAddonChargeForMonth(pricing, 100)).toBe(75000);
  });

  it("is_full_payment with bounded interval - only charges at interval_start", () => {
    const pricing = [
      { interval_start: 0, interval_end: 2, price: 100, is_full_payment: false },
      { interval_start: 3, interval_end: 3, price: 1000000, is_full_payment: true },
      { interval_start: 4, interval_end: null, price: 80, is_full_payment: false },
    ];
    expect(getAddonChargeForMonth(pricing, 2)).toBe(100);
    expect(getAddonChargeForMonth(pricing, 3)).toBe(1000000);
    expect(getAddonChargeForMonth(pricing, 4)).toBe(80);
  });
});
