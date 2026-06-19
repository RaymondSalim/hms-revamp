import { describe, it, expect, vi } from "vitest";

// The module under test imports `auth` (next-auth), whose dependency chain
// resolves `next/server` and breaks under vitest. The pure functions exercised
// here never call auth, so we stub the module to keep this a no-DB unit test.
// This mirrors the existing repo pattern in tests/helpers/mock-next.ts.
vi.mock("@/app/_lib/auth", () => ({
  auth: vi.fn(),
}));

import {
  scopeFromAssignments,
  isLocationInScope,
  pickSelectedLocationId,
} from "@/app/_lib/util/location-scope";

describe("scopeFromAssignments", () => {
  it("no assignments => global (null)", () => {
    expect(scopeFromAssignments([])).toBeNull();
  });
  it("one or more assignments => that array", () => {
    expect(scopeFromAssignments([2, 5])).toEqual([2, 5]);
  });
});

describe("isLocationInScope", () => {
  it("global scope allows any location", () => {
    expect(isLocationInScope(null, 99)).toBe(true);
  });
  it("scoped allows only assigned ids", () => {
    expect(isLocationInScope([2, 5], 5)).toBe(true);
    expect(isLocationInScope([2, 5], 7)).toBe(false);
  });
});

describe("pickSelectedLocationId", () => {
  it("global: honors a valid requested id", () => {
    expect(pickSelectedLocationId(null, 3, [1, 2, 3])).toBe(3);
  });
  it("global: falls back to first available when requested invalid/absent", () => {
    expect(pickSelectedLocationId(null, 99, [1, 2, 3])).toBe(1);
    expect(pickSelectedLocationId(null, null, [1, 2, 3])).toBe(1);
  });
  it("scoped: honors requested only if in scope", () => {
    expect(pickSelectedLocationId([2, 3], 3, [1, 2, 3])).toBe(3);
  });
  it("scoped: rejects out-of-scope requested, falls back to first in-scope", () => {
    expect(pickSelectedLocationId([2, 3], 1, [1, 2, 3])).toBe(2);
  });
  it("returns null when nothing is available", () => {
    expect(pickSelectedLocationId(null, null, [])).toBeNull();
    expect(pickSelectedLocationId([2], null, [])).toBeNull();
  });
});
