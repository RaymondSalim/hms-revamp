/**
 * Shared parsing/serialization for URL-driven server-side table state.
 *
 * List pages keep pagination, search, and sort in the query string
 * (?page=2&q=budi&sort=due_date&dir=desc) so the state is bookmarkable,
 * shareable, and survives reloads. The server component reads these params,
 * the DB layer applies them, and the client table writes them back on
 * interaction.
 */

export interface TableParams {
  page: number; // 1-based
  pageSize: number;
  search: string;
  sortBy: string | null;
  sortDir: "asc" | "desc";
}

export interface ParseOptions {
  /** Column keys the caller permits sorting by. Anything else is ignored so a
   *  hand-edited URL can't sort by an arbitrary/unindexed column. */
  allowedSortKeys?: readonly string[];
  defaultSortBy?: string | null;
  defaultSortDir?: "asc" | "desc";
  defaultPageSize?: number;
  maxPageSize?: number;
}

/** Next's searchParams value: string | string[] | undefined per key. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function toPositiveInt(
  value: string | undefined,
  fallback: number,
  max?: number
): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return fallback;
  return max ? Math.min(n, max) : n;
}

export function parseTableParams(
  raw: RawSearchParams | undefined,
  options: ParseOptions = {}
): TableParams {
  const {
    allowedSortKeys,
    defaultSortBy = null,
    defaultSortDir = "desc",
    defaultPageSize = 20,
    maxPageSize = 100,
  } = options;

  const sp = raw ?? {};

  const page = toPositiveInt(firstValue(sp.page), 1);
  const pageSize = toPositiveInt(
    firstValue(sp.pageSize),
    defaultPageSize,
    maxPageSize
  );
  const search = (firstValue(sp.q) ?? "").trim();

  const rawSortBy = firstValue(sp.sort) ?? defaultSortBy ?? null;
  const sortBy =
    rawSortBy && (!allowedSortKeys || allowedSortKeys.includes(rawSortBy))
      ? rawSortBy
      : defaultSortBy;

  const rawDir = firstValue(sp.dir);
  const sortDir: "asc" | "desc" =
    rawDir === "asc" || rawDir === "desc" ? rawDir : defaultSortDir;

  return { page, pageSize, search, sortBy, sortDir };
}

/** Prisma-friendly skip/take from 1-based page state. */
export function toSkipTake(params: Pick<TableParams, "page" | "pageSize">): {
  skip: number;
  take: number;
} {
  return { skip: (params.page - 1) * params.pageSize, take: params.pageSize };
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function buildPaginated<T>(
  rows: T[],
  total: number,
  params: Pick<TableParams, "page" | "pageSize">
): Paginated<T> {
  return {
    rows,
    total,
    page: params.page,
    pageSize: params.pageSize,
    pageCount: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

/**
 * Build a query string for a new table state, preserving any unrelated params
 * already present (e.g. a location selector). Resets to page 1 whenever search
 * or sort changes — staying on page 7 of a different result set is never right.
 */
export function buildTableQuery(
  current: URLSearchParams,
  patch: Partial<TableParams>
): string {
  const next = new URLSearchParams(current.toString());

  if (patch.search !== undefined) {
    if (patch.search) next.set("q", patch.search);
    else next.delete("q");
  }
  if (patch.sortBy !== undefined) {
    if (patch.sortBy) next.set("sort", patch.sortBy);
    else next.delete("sort");
  }
  if (patch.sortDir !== undefined) next.set("dir", patch.sortDir);
  if (patch.pageSize !== undefined) next.set("pageSize", String(patch.pageSize));

  // Page changes are explicit; any search/sort/pageSize change resets to 1.
  if (patch.page !== undefined) {
    next.set("page", String(patch.page));
  } else if (
    patch.search !== undefined ||
    patch.sortBy !== undefined ||
    patch.sortDir !== undefined ||
    patch.pageSize !== undefined
  ) {
    next.delete("page");
  }

  return next.toString();
}
