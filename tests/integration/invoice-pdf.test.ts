import { describe, it, expect } from "vitest";
import { computeInvoiceTotals } from "@/app/_lib/util/invoice-totals";

describe("computeInvoiceTotals (P3-3 invoice PDF helper)", () => {
  it("computes subtotal, tax, total, paid, outstanding", () => {
    const items = [
      { description: "Sewa kamar Juni", amount: 1000000 },
      { description: "Listrik", amount: 200000 },
      { description: "PPN 11%", amount: 132000 },
    ];
    const payments = [{ amount: 500000 }];

    const r = computeInvoiceTotals(items, payments);

    expect(r.subtotal).toBe(1200000); // excludes PPN
    expect(r.tax).toBe(132000); // only PPN
    expect(r.total).toBe(1332000); // all items
    expect(r.paid).toBe(500000);
    expect(r.outstanding).toBe(832000); // total - paid
  });

  it("treats a bill with no tax items as tax 0 and subtotal = total", () => {
    const items = [
      { description: "Sewa kamar", amount: 800000 },
      { description: "Deposit", amount: 800000 },
    ];
    const r = computeInvoiceTotals(items, []);

    expect(r.tax).toBe(0);
    expect(r.subtotal).toBe(1600000);
    expect(r.total).toBe(1600000);
    expect(r.paid).toBe(0);
    expect(r.outstanding).toBe(1600000);
  });

  it("only matches the 'PPN ' prefix (with trailing space), not other items", () => {
    const items = [
      { description: "PPNX bukan pajak", amount: 100000 },
      { description: "PPN 11%", amount: 11000 },
    ];
    const r = computeInvoiceTotals(items, []);

    expect(r.tax).toBe(11000);
    expect(r.subtotal).toBe(100000);
    expect(r.total).toBe(111000);
  });

  it("sums multiple payments and supports negative (credit) outstanding on overpayment", () => {
    const items = [{ description: "Sewa", amount: 1000000 }];
    const payments = [{ amount: 600000 }, { amount: 600000 }];
    const r = computeInvoiceTotals(items, payments);

    expect(r.paid).toBe(1200000);
    expect(r.outstanding).toBe(-200000);
  });

  it("accepts string amounts (Prisma Decimal serialized as string)", () => {
    const items = [
      { description: "Sewa", amount: "1000000" },
      { description: "PPN 11%", amount: "110000" },
    ];
    const payments = [{ amount: "110000" }];
    const r = computeInvoiceTotals(items, payments);

    expect(r.subtotal).toBe(1000000);
    expect(r.tax).toBe(110000);
    expect(r.total).toBe(1110000);
    expect(r.paid).toBe(110000);
    expect(r.outstanding).toBe(1000000);
  });
});
