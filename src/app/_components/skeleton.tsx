import type { CSSProperties } from "react";

interface SkeletonProps {
  /** Tailwind utility classes for sizing/spacing (e.g. "h-4 w-32"). */
  className?: string;
  /** Inline width override (number = px). */
  width?: string | number;
  /** Inline height override (number = px). */
  height?: string | number;
  /** Render as a circle (avatars, icon placeholders). */
  circle?: boolean;
  style?: CSSProperties;
}

/**
 * Base shimmer block. Compose it for bespoke layouts, or use the
 * higher-level helpers below for the common table/card/page shapes.
 */
export function Skeleton({ className = "", width, height, circle, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton block ${className}`}
      style={{
        width,
        height,
        borderRadius: circle ? "9999px" : undefined,
        ...style,
      }}
    />
  );
}

/**
 * Placeholder matching the look of `DataTable` / `ServerDataTable`:
 * a search bar, header row, and several body rows.
 */
export function SkeletonTable({
  rows = 8,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="space-y-4" role="status" aria-label="Memuat data">
      {/* Search bar */}
      <Skeleton className="h-10 max-w-sm" />

      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: "var(--color-border)", boxShadow: "var(--shadow-sm)" }}
      >
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: "var(--color-bg-card)" }}>
              {Array.from({ length: columns }).map((_, i) => (
                <th
                  key={i}
                  className="px-4 py-3 border-b text-left"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <Skeleton className="h-3.5 w-24" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, rowIdx) => (
              <tr
                key={rowIdx}
                style={{
                  backgroundColor:
                    rowIdx % 2 === 0 ? "var(--color-bg-card)" : "var(--color-bg-primary)",
                }}
              >
                {Array.from({ length: columns }).map((_, colIdx) => (
                  <td
                    key={colIdx}
                    className="px-4 py-3 border-b"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <Skeleton className="h-3.5" width={colIdx === 0 ? "70%" : "55%"} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="sr-only">Memuat data…</span>
    </div>
  );
}

/** Placeholder for a single card/panel (summary tiles, detail blocks). */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div
      className="rounded-lg border p-5 space-y-3"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
      role="status"
      aria-label="Memuat"
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-32" />
      {lines > 2 &&
        Array.from({ length: lines - 2 }).map((_, i) => (
          <Skeleton key={i} className="h-3" width={`${80 - i * 15}%`} />
        ))}
    </div>
  );
}

/**
 * Full-page list placeholder: a title bar plus a table. Drop this straight
 * into a route-level `loading.tsx` for list pages.
 */
export function PageSkeleton({
  rows = 8,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-36" />
      </div>
      <SkeletonTable rows={rows} columns={columns} />
    </div>
  );
}
