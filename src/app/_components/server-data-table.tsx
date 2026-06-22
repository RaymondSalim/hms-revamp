"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { buildTableQuery } from "@/app/_lib/util/table-params";

/**
 * Server-driven table for large datasets. Pagination, search, and sort live in
 * the URL and are resolved by the server component + DB layer; this component
 * only renders the current page and writes state changes back to the query
 * string. Use the simpler client-side <DataTable> for small reference tables.
 */
interface ServerDataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  search: string;
  sortBy: string | null;
  sortDir: "asc" | "desc";
  /** Column ids that may be sorted server-side. Headers not listed are inert. */
  sortableColumns?: readonly string[];
  searchable?: boolean;
  searchPlaceholder?: string;
}

export function ServerDataTable<TData>({
  columns,
  data,
  total,
  page,
  pageSize,
  pageCount,
  search,
  sortBy,
  sortDir,
  sortableColumns = [],
  searchable = true,
  searchPlaceholder = "Cari...",
}: ServerDataTableProps<TData>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchInput, setSearchInput] = useState(search);
  // Keep the box in sync when the URL changes from elsewhere (back button, etc.)
  // without clobbering what the user is mid-type. Only resync when the
  // committed search param actually differs from the last value we pushed.
  const lastPushedSearch = useRef(search);

  const navigate = (patch: Parameters<typeof buildTableQuery>[1]) => {
    const qs = buildTableQuery(new URLSearchParams(searchParams.toString()), patch);
    startTransition(() => {
      router.push(`${pathname}?${qs}`, { scroll: false });
    });
  };

  // Debounce search input → URL.
  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => {
      lastPushedSearch.current = searchInput;
      navigate({ search: searchInput });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    if (search !== lastPushedSearch.current) {
      lastPushedSearch.current = search;
      setSearchInput(search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount,
  });

  const toggleSort = (columnId: string) => {
    if (!sortableColumns.includes(columnId)) return;
    const nextDir: "asc" | "desc" =
      sortBy === columnId && sortDir === "asc" ? "desc" : "asc";
    navigate({ sortBy: columnId, sortDir: nextDir });
  };

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4" style={{ opacity: isPending ? 0.6 : 1 }}>
      {searchable && (
        <div className="relative max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            viewBox="0 0 20 20"
            fill="currentColor"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg-card)",
              color: "var(--color-text-primary)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-focus)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(194, 65, 12, 0.1)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>
      )}

      <div
        className="overflow-x-auto rounded-lg border"
        style={{
          borderColor: "var(--color-border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} style={{ backgroundColor: "var(--color-bg-card)" }}>
                {headerGroup.headers.map((header) => {
                  const canSort = sortableColumns.includes(header.column.id);
                  const isSorted = sortBy === header.column.id;
                  return (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left font-semibold border-b select-none"
                      style={{
                        color: "var(--color-text-secondary)",
                        borderColor: "var(--color-border)",
                        cursor: canSort ? "pointer" : "default",
                      }}
                      onClick={canSort ? () => toggleSort(header.column.id) : undefined}
                    >
                      <div className="flex items-center gap-1.5">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {isSorted && (
                          <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Tidak ada data ditemukan
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, rowIdx) => (
                <tr
                  key={row.id}
                  className="transition-colors duration-100"
                  style={{
                    backgroundColor:
                      rowIdx % 2 === 0
                        ? "var(--color-bg-card)"
                        : "var(--color-bg-primary)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--color-accent-light)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      rowIdx % 2 === 0
                        ? "var(--color-bg-card)"
                        : "var(--color-bg-primary)";
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-4 py-3 border-b"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Menampilkan {from} - {to} dari {total} data
          </p>
          <div className="flex items-center gap-1">
            <PaginationButton
              onClick={() => navigate({ page: page - 1 })}
              disabled={page <= 1}
            >
              &larr;
            </PaginationButton>
            {pageWindow(page, pageCount).map((p, i) =>
              p === "..." ? (
                <span
                  key={`gap-${i}`}
                  className="px-2 text-sm"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  …
                </span>
              ) : (
                <PaginationButton
                  key={p}
                  onClick={() => navigate({ page: p })}
                  active={p === page}
                >
                  {p}
                </PaginationButton>
              )
            )}
            <PaginationButton
              onClick={() => navigate({ page: page + 1 })}
              disabled={page >= pageCount}
            >
              &rarr;
            </PaginationButton>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact page list: first, last, current ±1, with ellipses. Avoids rendering
 * hundreds of buttons when a dataset has many pages (the old client table
 * rendered every page number).
 */
function pageWindow(current: number, count: number): Array<number | "..."> {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const pages: Array<number | "..."> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(count - 1, current + 1);
  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < count - 1) pages.push("...");
  pages.push(count);
  return pages;
}

function PaginationButton({
  children,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        backgroundColor: active ? "var(--color-accent)" : "transparent",
        color: active ? "white" : "var(--color-text-primary)",
        border: active ? "none" : "1px solid var(--color-border)",
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled) {
          e.currentTarget.style.backgroundColor = "var(--color-accent-light)";
          e.currentTarget.style.borderColor = "var(--color-accent)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active && !disabled) {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.borderColor = "var(--color-border)";
        }
      }}
    >
      {children}
    </button>
  );
}
