import { describe, it, expect } from "vitest";
import { splitGuestStayByMonth } from "@/app/_lib/util/guest-billing";

describe("splitGuestStayByMonth", () => {
  it("stay within single month (Jan 5 to Jan 20, fee=50000): 16 days x 50000", () => {
    const start = new Date(Date.UTC(2025, 0, 5)); // Jan 5
    const end = new Date(Date.UTC(2025, 0, 20)); // Jan 20
    const segments = splitGuestStayByMonth(start, end, 50000);

    expect(segments).toHaveLength(1);
    expect(segments[0].month).toBe(0); // January
    expect(segments[0].year).toBe(2025);
    expect(segments[0].days).toBe(16); // Jan 5 to Jan 20 inclusive
    expect(segments[0].amount).toBe(16 * 50000);
  });

  it("stay spanning 2 months (Jan 15 to Feb 15, fee=100000): Jan=17 days, Feb=15 days", () => {
    const start = new Date(Date.UTC(2025, 0, 15)); // Jan 15
    const end = new Date(Date.UTC(2025, 1, 15)); // Feb 15
    const segments = splitGuestStayByMonth(start, end, 100000);

    expect(segments).toHaveLength(2);

    // January: Jan 15 to Jan 31 = 17 days
    expect(segments[0].month).toBe(0);
    expect(segments[0].year).toBe(2025);
    expect(segments[0].days).toBe(17);
    expect(segments[0].amount).toBe(17 * 100000);

    // February: Feb 1 to Feb 15 = 15 days
    expect(segments[1].month).toBe(1);
    expect(segments[1].year).toBe(2025);
    expect(segments[1].days).toBe(15);
    expect(segments[1].amount).toBe(15 * 100000);
  });

  it("stay spanning 3 months (Jan 1 to Mar 31, fee=50000): Jan=31, Feb=28, Mar=31", () => {
    const start = new Date(Date.UTC(2025, 0, 1)); // Jan 1
    const end = new Date(Date.UTC(2025, 2, 31)); // Mar 31
    const segments = splitGuestStayByMonth(start, end, 50000);

    expect(segments).toHaveLength(3);

    // January: 31 days
    expect(segments[0].month).toBe(0);
    expect(segments[0].days).toBe(31);
    expect(segments[0].amount).toBe(31 * 50000);

    // February 2025 (non-leap): 28 days
    expect(segments[1].month).toBe(1);
    expect(segments[1].days).toBe(28);
    expect(segments[1].amount).toBe(28 * 50000);

    // March: 31 days
    expect(segments[2].month).toBe(2);
    expect(segments[2].days).toBe(31);
    expect(segments[2].amount).toBe(31 * 50000);
  });

  it("single day stay: 1 day x fee", () => {
    const start = new Date(Date.UTC(2025, 3, 10)); // Apr 10
    const end = new Date(Date.UTC(2025, 3, 10)); // Apr 10
    const segments = splitGuestStayByMonth(start, end, 75000);

    expect(segments).toHaveLength(1);
    expect(segments[0].month).toBe(3);
    expect(segments[0].year).toBe(2025);
    expect(segments[0].days).toBe(1);
    expect(segments[0].amount).toBe(75000);
  });

  it("stay ending on last day of month", () => {
    const start = new Date(Date.UTC(2025, 0, 20)); // Jan 20
    const end = new Date(Date.UTC(2025, 0, 31)); // Jan 31
    const segments = splitGuestStayByMonth(start, end, 60000);

    expect(segments).toHaveLength(1);
    expect(segments[0].month).toBe(0);
    expect(segments[0].year).toBe(2025);
    expect(segments[0].days).toBe(12); // Jan 20 to Jan 31 inclusive
    expect(segments[0].amount).toBe(12 * 60000);
  });

  it("stay spanning year boundary (Dec 25 to Jan 5)", () => {
    const start = new Date(Date.UTC(2025, 11, 25)); // Dec 25 2025
    const end = new Date(Date.UTC(2026, 0, 5)); // Jan 5 2026
    const segments = splitGuestStayByMonth(start, end, 100000);

    expect(segments).toHaveLength(2);

    // December: Dec 25 to Dec 31 = 7 days
    expect(segments[0].month).toBe(11);
    expect(segments[0].year).toBe(2025);
    expect(segments[0].days).toBe(7);
    expect(segments[0].amount).toBe(7 * 100000);

    // January: Jan 1 to Jan 5 = 5 days
    expect(segments[1].month).toBe(0);
    expect(segments[1].year).toBe(2026);
    expect(segments[1].days).toBe(5);
    expect(segments[1].amount).toBe(5 * 100000);
  });
});
