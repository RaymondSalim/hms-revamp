import { Skeleton, SkeletonCard, SkeletonTable } from "@/app/_components/skeleton";

/** Loading fallback mirroring the dashboard's stat-card grid + table panels. */
export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </div>

      {/* Recent payments / outstanding bills panels */}
      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
      >
        <Skeleton className="h-5 w-40 mb-4" />
        <SkeletonTable rows={5} columns={5} />
      </div>
    </div>
  );
}
