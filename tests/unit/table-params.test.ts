import { describe, it, expect } from "vitest";
import {
  parseTableParams,
  toSkipTake,
  buildPaginated,
  buildTableQuery,
} from "@/app/_lib/util/table-params";

describe("parseTableParams", () => {
  it("applies defaults when params are absent", () => {
    const p = parseTableParams(undefined, { defaultPageSize: 20 });
    expect(p).toEqual({
      page: 1,
      pageSize: 20,
      search: "",
      sortBy: null,
      sortDir: "desc",
    });
  });

  it("parses valid values", () => {
    const p = parseTableParams(
      { page: "3", pageSize: "50", q: " budi ", sort: "due_date", dir: "asc" },
      { allowedSortKeys: ["due_date"] }
    );
    expect(p).toMatchObject({
      page: 3,
      pageSize: 50,
      search: "budi",
      sortBy: "due_date",
      sortDir: "asc",
    });
  });

  it("rejects sort keys not in the allow-list", () => {
    const p = parseTableParams(
      { sort: "password" },
      { allowedSortKeys: ["due_date"], defaultSortBy: "due_date" }
    );
    expect(p.sortBy).toBe("due_date");
  });

  it("clamps pageSize to the maximum", () => {
    const p = parseTableParams({ pageSize: "9999" }, { maxPageSize: 100 });
    expect(p.pageSize).toBe(100);
  });

  it("falls back on invalid/negative/zero page", () => {
    expect(parseTableParams({ page: "0" }).page).toBe(1);
    expect(parseTableParams({ page: "-5" }).page).toBe(1);
    expect(parseTableParams({ page: "abc" }).page).toBe(1);
    expect(parseTableParams({ page: "1.5" }).page).toBe(1);
  });

  it("takes the first value when a param repeats", () => {
    const p = parseTableParams({ page: ["2", "9"] });
    expect(p.page).toBe(2);
  });

  it("ignores an invalid sort direction", () => {
    const p = parseTableParams({ dir: "sideways" }, { defaultSortDir: "desc" });
    expect(p.sortDir).toBe("desc");
  });
});

describe("toSkipTake", () => {
  it("computes skip/take from 1-based page", () => {
    expect(toSkipTake({ page: 1, pageSize: 20 })).toEqual({ skip: 0, take: 20 });
    expect(toSkipTake({ page: 3, pageSize: 20 })).toEqual({ skip: 40, take: 20 });
  });
});

describe("buildPaginated", () => {
  it("computes pageCount (ceil) and echoes state", () => {
    const r = buildPaginated([1, 2], 45, { page: 2, pageSize: 20 });
    expect(r).toEqual({
      rows: [1, 2],
      total: 45,
      page: 2,
      pageSize: 20,
      pageCount: 3,
    });
  });

  it("never returns a pageCount below 1 (empty result)", () => {
    expect(buildPaginated([], 0, { page: 1, pageSize: 20 }).pageCount).toBe(1);
  });
});

describe("buildTableQuery", () => {
  it("resets to page 1 when search changes", () => {
    const cur = new URLSearchParams("page=7&q=old");
    const qs = new URLSearchParams(buildTableQuery(cur, { search: "new" }));
    expect(qs.get("q")).toBe("new");
    expect(qs.has("page")).toBe(false);
  });

  it("keeps the page when only page changes", () => {
    const cur = new URLSearchParams("q=budi");
    const qs = new URLSearchParams(buildTableQuery(cur, { page: 4 }));
    expect(qs.get("page")).toBe("4");
    expect(qs.get("q")).toBe("budi");
  });

  it("clears q when search is emptied", () => {
    const cur = new URLSearchParams("q=budi&page=2");
    const qs = new URLSearchParams(buildTableQuery(cur, { search: "" }));
    expect(qs.has("q")).toBe(false);
    expect(qs.has("page")).toBe(false);
  });

  it("preserves unrelated params (e.g. location)", () => {
    const cur = new URLSearchParams("selectedLocationId=3&page=2");
    const qs = new URLSearchParams(buildTableQuery(cur, { sortBy: "amount" }));
    expect(qs.get("selectedLocationId")).toBe("3");
    expect(qs.get("sort")).toBe("amount");
    expect(qs.has("page")).toBe(false);
  });
});
