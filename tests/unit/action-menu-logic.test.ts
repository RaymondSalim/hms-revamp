import { describe, it, expect } from "vitest";
import { splitInline, DEFAULT_DISABLED_REASON } from "@/app/_components/action-menu";

describe("splitInline", () => {
  it("renders all items inline when count <= maxInline", () => {
    expect(splitInline(2, 2)).toEqual({ inline: 2, overflow: 0 });
  });

  it("splits into inline + overflow when count > maxInline", () => {
    expect(splitInline(5, 2)).toEqual({ inline: 2, overflow: 3 });
  });

  it("treats disabled items no differently — split depends only on count", () => {
    // Whether items are disabled does not change the count-based split.
    expect(splitInline(3, 2)).toEqual({ inline: 2, overflow: 1 });
  });
});

describe("DEFAULT_DISABLED_REASON", () => {
  it("is the Indonesian permission message", () => {
    expect(DEFAULT_DISABLED_REASON).toBe("Anda tidak memiliki izin untuk tindakan ini");
  });
});
