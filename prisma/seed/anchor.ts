import { startOfUtcDay, startOfUtcMonth, addUtcMonths } from "@/app/_lib/util/business-time";

const DAY_MS = 86_400_000;

/** The seed's "now": PREVIEW_NOW (midnight-UTC) when set, else today midnight-UTC. */
export function seedNow(): Date {
  const raw = process.env.PREVIEW_NOW;
  const base = raw ? new Date(raw) : new Date();
  return startOfUtcDay(base);
}

/** First-of-month, n months from seedNow()'s month (n may be negative). */
export function monthsFrom(n: number): Date {
  return addUtcMonths(startOfUtcMonth(seedNow()), n);
}

/** seedNow() offset by n whole days (n may be negative), midnight-UTC. */
export function daysFrom(n: number): Date {
  return new Date(seedNow().getTime() + n * DAY_MS);
}
