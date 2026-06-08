import { describe, it, expect } from "vitest";
import { formatCurrency } from "@/app/_lib/util/currency";

describe("formatCurrency", () => {
  it("number input: 1500000 -> Rp1.500.000", () => {
    const result = formatCurrency(1500000);
    // Intl.NumberFormat with id-ID locale uses non-breaking space between Rp and number
    expect(result).toMatch(/Rp\s?1\.500\.000/);
  });

  it("string input: '2500000' -> proper formatting", () => {
    const result = formatCurrency("2500000");
    expect(result).toMatch(/Rp\s?2\.500\.000/);
  });

  it("string with decimals: '2500000.50' -> rounds to Rp2.500.001 or Rp2.500.000", () => {
    const result = formatCurrency("2500000.50");
    // With maximumFractionDigits: 0, it rounds
    expect(result).toMatch(/Rp\s?2\.500\.00[01]/);
  });

  it("zero -> Rp0", () => {
    const result = formatCurrency(0);
    expect(result).toMatch(/Rp\s?0/);
  });

  it("null -> Rp 0 (Number(null) is 0)", () => {
    const result = formatCurrency(null);
    expect(result).toMatch(/Rp\s?0/);
  });

  it("undefined -> '-' (Number(undefined) is NaN)", () => {
    expect(formatCurrency(undefined)).toBe("-");
  });

  it("non-numeric string -> '-'", () => {
    expect(formatCurrency("abc")).toBe("-");
  });

  it("negative number: -500000 -> formatted with minus sign", () => {
    const result = formatCurrency(-500000);
    expect(result).toMatch(/-Rp\s?500\.000|Rp\s?-500\.000/);
  });

  it("large number: 100000000 -> Rp100.000.000", () => {
    const result = formatCurrency(100000000);
    expect(result).toMatch(/Rp\s?100\.000\.000/);
  });
});
