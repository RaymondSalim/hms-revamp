// The single wall-clock entry point for BUSINESS time. Real time by default;
// returns a FROZEN instant only when PREVIEW_NOW is set in a non-production
// environment. MUST NOT import from business-time.ts (avoid a cycle).

/** True only when freezing the clock is permitted in this environment. */
export function isPreviewClockAllowed(): boolean {
  // Hard refusal in production. Vercel production blocks unconditionally; a
  // generic prod box (NODE_ENV=production, e.g. Docker/VPS) blocks unless an
  // explicit staging opt-in is set in tandem — a real production config would
  // never set PREVIEW_CLOCK_ENABLED.
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.NODE_ENV === "production" && process.env.PREVIEW_CLOCK_ENABLED !== "true") {
    return false;
  }
  return true;
}

/** Parsed PREVIEW_NOW epoch ms, or NaN when unset/unparseable. */
function previewInstantMs(): number {
  const raw = process.env.PREVIEW_NOW;
  if (!raw) return NaN;
  return new Date(raw).getTime();
}

/** Whether the business clock is currently frozen (drives the banner). */
export function isPreviewClockEnabled(): boolean {
  if (!process.env.PREVIEW_NOW) return false;
  if (!isPreviewClockAllowed()) return false;
  return !Number.isNaN(previewInstantMs());
}

/**
 * The business "now". Returns the frozen PREVIEW_NOW instant when set, allowed,
 * and valid; real time otherwise. Never throws. Logs loudly when a configured
 * PREVIEW_NOW is refused (production) or unparseable, so a misconfig is visible
 * rather than silently changing the clock.
 */
export function now(): Date {
  const raw = process.env.PREVIEW_NOW;
  if (!raw) return new Date();
  if (!isPreviewClockAllowed()) {
    console.error("[clock] PREVIEW_NOW ignored: refusing to override clock in production");
    return new Date();
  }
  const ms = new Date(raw).getTime();
  if (Number.isNaN(ms)) {
    console.error(`[clock] PREVIEW_NOW is not a valid date: "${raw}" — using real time`);
    return new Date();
  }
  return new Date(ms);
}
