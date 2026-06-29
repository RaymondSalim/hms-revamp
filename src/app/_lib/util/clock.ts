// The single wall-clock entry point for BUSINESS time. Real time by default;
// returns a FROZEN instant only when PREVIEW_NOW is set in a non-production
// environment. MUST NOT import from business-time.ts (avoid a cycle).

/**
 * True only when freezing the clock is permitted in this environment.
 *
 * Default-deny: an unknown/bare environment (e.g. a self-hosted box that never
 * set NODE_ENV) is treated as production-like and REFUSED, so a leaked
 * PREVIEW_NOW cannot accidentally freeze it. Freezing requires either an
 * explicit opt-in or an affirmative non-production signal.
 */
export function isPreviewClockAllowed(): boolean {
  // 1. Vercel production: hard block, unconditional — not even the opt-in
  //    can override it.
  if (process.env.VERCEL_ENV === "production") return false;
  // 2. Explicit opt-in allows any remaining environment (e.g. a staging box
  //    that runs NODE_ENV=production deliberately). A real production config
  //    would never set this.
  if (process.env.PREVIEW_CLOCK_ENABLED === "true") return true;
  // 3. Otherwise require an affirmative non-production signal. Anything else
  //    (NODE_ENV=production, or an unset/unknown environment) is refused.
  if (process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development") {
    return true;
  }
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    return true;
  }
  return false;
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
