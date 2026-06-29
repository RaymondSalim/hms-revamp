import { isPreviewClockEnabled } from "@/app/_lib/util/clock";
import { businessToday, formatUtcDate } from "@/app/_lib/util/business-time";

/**
 * Server component. Renders a slim amber banner indicating the app's business
 * clock is FROZEN to a fixed date (preview/staging only). Returns null in
 * production or whenever the clock is not frozen, so it has zero footprint
 * outside preview environments.
 */
export function PreviewClockBanner() {
  if (!isPreviewClockEnabled()) return null;
  const label = formatUtcDate(businessToday());
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium shrink-0"
      style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
      </svg>
      <span>Mode uji — waktu sistem dibekukan pada {label}</span>
    </div>
  );
}
