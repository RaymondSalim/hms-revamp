import { describe, it, expect } from "vitest";
import { buildCan } from "@/app/_context/permissions-context";

describe("buildCan", () => {
  it("returns true for a permission that is present", () => {
    const can = buildCan(["locations.manage", "tenants.view"]);
    expect(can("locations.manage")).toBe(true);
  });

  it("returns false for a permission that is absent", () => {
    const can = buildCan(["tenants.view"]);
    expect(can("locations.manage")).toBe(false);
  });

  it("returns false for every check when the list is empty", () => {
    const can = buildCan([]);
    expect(can("anything.manage")).toBe(false);
  });
});
