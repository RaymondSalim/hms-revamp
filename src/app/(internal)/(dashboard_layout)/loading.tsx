import { PageSkeleton } from "@/app/_components/skeleton";

/**
 * Default loading fallback for dashboard routes. Most pages render a titled
 * list/table, so a page-level table skeleton is the right baseline. Routes
 * with a different shape (e.g. the card-based dashboard) provide their own
 * nested `loading.tsx`.
 */
export default function Loading() {
  return <PageSkeleton />;
}
