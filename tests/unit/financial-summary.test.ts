import { describe, it, expect } from "vitest";
import { computeFinancialSummary } from "@/app/_lib/util/financial-summary";
import { Decimal } from "@prisma/client/runtime/library";

function d(n: number) {
  return new Decimal(n);
}

describe("computeFinancialSummary", () => {
  it("computes outstanding from bill items minus allocated payments", () => {
    const bookings = [
      {
        bills: [
          {
            bill_item: [{ amount: d(5000000) }, { amount: d(500000) }],
            paymentBills: [{ amount: d(3000000) }],
            due_date: new Date("2026-01-01"),
          },
        ],
        payments: [{ amount: d(3000000) }],
        deposit: { amount: d(5000000), status: "HELD" as const },
      },
    ] as any;

    const result = computeFinancialSummary(bookings);

    expect(result.outstanding).toBe(2500000);
    expect(result.totalPaid).toBe(3000000);
    expect(result.activeDeposits).toBe(5000000);
    expect(result.overdueCount).toBe(1); // due_date 2026-01-01 < today
  });

  it("returns zeros for tenant with no bookings", () => {
    const result = computeFinancialSummary([]);
    expect(result.outstanding).toBe(0);
    expect(result.totalPaid).toBe(0);
    expect(result.activeDeposits).toBe(0);
    expect(result.overdueCount).toBe(0);
  });

  it("does not count fully paid bills as overdue", () => {
    const bookings = [
      {
        bills: [
          {
            bill_item: [{ amount: d(5000000) }],
            paymentBills: [{ amount: d(5000000) }],
            due_date: new Date("2025-01-01"), // past due but fully paid
          },
        ],
        payments: [{ amount: d(5000000) }],
        deposit: null,
      },
    ] as any;

    const result = computeFinancialSummary(bookings);
    expect(result.outstanding).toBe(0);
    expect(result.overdueCount).toBe(0);
  });

  it("sums deposits only with status HELD", () => {
    const bookings = [
      {
        bills: [],
        payments: [],
        deposit: { amount: d(5000000), status: "HELD" as const },
      },
      {
        bills: [],
        payments: [],
        deposit: { amount: d(3000000), status: "REFUNDED" as const },
      },
      {
        bills: [],
        payments: [],
        deposit: { amount: d(2000000), status: "APPLIED" as const },
      },
    ] as any;

    const result = computeFinancialSummary(bookings);
    expect(result.activeDeposits).toBe(5000000);
  });
});
