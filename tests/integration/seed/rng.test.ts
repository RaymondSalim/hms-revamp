import { describe, it, expect } from "vitest";
import { makeRng, genName, genPhone, genEmail, genIdNumber } from "../../../prisma/seed/rng";

describe("seeded Rng", () => {
  it("is deterministic for the same seed", () => {
    const a = makeRng(123);
    const b = makeRng(123);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    const a = Array.from({ length: 5 }, () => makeRng(1).next());
    const b = Array.from({ length: 5 }, () => makeRng(2).next());
    expect(a).not.toEqual(b);
  });

  it("int() stays within [min,max] and is deterministic", () => {
    const r = makeRng(7);
    const vals = Array.from({ length: 100 }, () => r.int(5, 9));
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(5);
    expect(Math.max(...vals)).toBeLessThanOrEqual(9);
    expect(makeRng(7).int(5, 9)).toBe(makeRng(7).int(5, 9));
  });

  it("pick() and weighted() are deterministic and in-range", () => {
    const r1 = makeRng(42);
    const r2 = makeRng(42);
    expect(r1.pick(["a", "b", "c"])).toBe(r2.pick(["a", "b", "c"]));
    const w1 = makeRng(9).weighted([["x", 1], ["y", 9]]);
    const w2 = makeRng(9).weighted([["x", 1], ["y", 9]]);
    expect(w1).toBe(w2);
    expect(["x", "y"]).toContain(w1);
  });

  it("data generators are deterministic and well-formed", () => {
    const r1 = makeRng(5); const r2 = makeRng(5);
    const n1 = genName(r1); const n2 = genName(r2);
    expect(n1).toBe(n2);
    expect(n1.length).toBeGreaterThan(0);
    const p = genPhone(makeRng(1));
    expect(p).toMatch(/^08\d{8,}$/);
    const email = genEmail(makeRng(1), "Budi Santoso");
    expect(email).toContain("@");
    expect(genIdNumber(makeRng(1))).toMatch(/^\d{10,}$/);
  });
});
