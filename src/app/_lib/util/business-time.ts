// Business-time helpers.
//
// All business "calendar day" fields are Prisma `@db.Date` columns, which
// Postgres stores and Prisma returns as midnight-UTC Date objects (the time
// component is always 00:00:00Z). The application's business timezone is WIB
// (Asia/Jakarta) — a FIXED UTC+7 offset with no daylight-saving transitions.
//
// The bug these helpers prevent: computing "today" with `new Date()` and then
// reading `.getMonth()`/`.getDate()` yields the SERVER's local calendar day.
// On a UTC host (e.g. Vercel) between 00:00–06:59 WIB the server clock is still
// on the previous calendar day, so month-boundary billing and status logic fire
// on the wrong day. Likewise, reading parts of a midnight-UTC `@db.Date` with
// local accessors shifts the day on any non-UTC server.
//
// Convention used everywhere below: a "business day" is represented as a
// midnight-UTC Date, matching `@db.Date` storage. All part extraction and
// calendar math is done in UTC space so results are independent of the host
// timezone.

export const BUSINESS_UTC_OFFSET_HOURS = 7; // WIB (Asia/Jakarta), fixed, no DST.

// The current business calendar day, as a midnight-UTC Date matching @db.Date
// storage. `now` is injectable for testing.
export function businessToday(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + BUSINESS_UTC_OFFSET_HOURS * 3_600_000);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
  );
}

// Normalize any Date to the midnight-UTC representation of its UTC calendar day.
// Use to compare a stored @db.Date against a computed day without time drift.
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// UTC calendar-day parts of a (midnight-UTC) business date.
export function utcDateParts(d: Date): { year: number; month: number; day: number } {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

// First day of the month containing `d`, as midnight-UTC.
export function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

// Last day of the month containing `d`, as midnight-UTC. Day 0 of the next
// month is the last day of this month.
export function lastDayOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

// Number of days in the month containing `d`.
export function daysInUtcMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

// Add `n` calendar months to `d`, preserving the day-of-month where possible
// and clamping to the last day when the target month is shorter. Returns a
// midnight-UTC Date.
export function addUtcMonths(d: Date, n: number): Date {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + n;
  const day = d.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

const INDONESIAN_SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

// Format a @db.Date (midnight-UTC) as `dd MMM yyyy` (e.g. "05 Jan 2026") using
// the UTC calendar day, so the rendered date matches what was stored regardless
// of the server's local timezone. For server-side documents (PDF, exports).
export function formatUtcDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = INDONESIAN_SHORT_MONTHS[d.getUTCMonth()];
  return `${day} ${month} ${d.getUTCFullYear()}`;
}

// Format a @db.Date (midnight-UTC) as `dd/MM/yyyy` using the UTC calendar day.
export function formatUtcDateNumeric(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}
