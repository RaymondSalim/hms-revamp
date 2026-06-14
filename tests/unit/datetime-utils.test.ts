import { describe, it, expect } from "vitest";
import { getIndonesianMonthName, countMonths } from "@/app/_lib/util/datetime";

describe("getIndonesianMonthName", () => {
  it("month 0 = Januari", () => {
    expect(getIndonesianMonthName(0)).toBe("Januari");
  });

  it("month 11 = Desember", () => {
    expect(getIndonesianMonthName(11)).toBe("Desember");
  });

  it("month 1 = Februari", () => {
    expect(getIndonesianMonthName(1)).toBe("Februari");
  });

  it("month 4 = Mei", () => {
    expect(getIndonesianMonthName(4)).toBe("Mei");
  });

  it("month 6 = Juli", () => {
    expect(getIndonesianMonthName(6)).toBe("Juli");
  });
});

describe("countMonths", () => {
  it("same month, start on 1st = 1", () => {
    const start = new Date(Date.UTC(2025, 0, 1)); // Jan 1
    const end = new Date(Date.UTC(2025, 0, 31)); // Jan 31
    expect(countMonths(start, end)).toBe(1);
  });

  it("same month, start NOT on 1st = 0", () => {
    const start = new Date(Date.UTC(2025, 0, 15)); // Jan 15
    const end = new Date(Date.UTC(2025, 0, 31)); // Jan 31
    expect(countMonths(start, end)).toBe(0);
  });

  it("Jan 1 to Jun 30 = 6 (start on 1st)", () => {
    const start = new Date(Date.UTC(2025, 0, 1)); // Jan 1
    const end = new Date(Date.UTC(2025, 5, 30)); // Jun 30
    expect(countMonths(start, end)).toBe(6);
  });

  it("Jan 15 to Jun 30 = 5 (start NOT on 1st, so subtract 1)", () => {
    const start = new Date(Date.UTC(2025, 0, 15)); // Jan 15
    const end = new Date(Date.UTC(2025, 5, 30)); // Jun 30
    expect(countMonths(start, end)).toBe(5);
  });

  it("Jan 1 to Jan 1 (same date on 1st) = 1", () => {
    const start = new Date(Date.UTC(2025, 0, 1));
    const end = new Date(Date.UTC(2025, 0, 1));
    expect(countMonths(start, end)).toBe(1);
  });

  it("handles reversed dates (end before start)", () => {
    const start = new Date(Date.UTC(2025, 5, 30)); // Jun 30
    const end = new Date(Date.UTC(2025, 0, 1)); // Jan 1
    // Implementation normalizes order: earlier=Jan1 (1st), diff=5, base=6
    expect(countMonths(start, end)).toBe(6);
  });
});
