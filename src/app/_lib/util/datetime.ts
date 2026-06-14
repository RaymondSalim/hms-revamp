const INDONESIAN_MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function getIndonesianMonthName(month: number): string {
  return INDONESIAN_MONTHS[month];
}

// BL-027: countMonths
// First partial month does NOT count, last month ALWAYS counts.
// Base = calendar month diff + 1. If start day != 1, subtract one.
// Dates are @db.Date (midnight UTC); compute the calendar-month diff in UTC space
// so the result is independent of the server's local timezone.
export function countMonths(start: Date, end: Date): number {
  const [earlier, later] = start <= end ? [start, end] : [end, start];
  const monthDiff =
    (later.getUTCFullYear() - earlier.getUTCFullYear()) * 12 +
    (later.getUTCMonth() - earlier.getUTCMonth());
  const base = monthDiff + 1;
  return earlier.getUTCDate() !== 1 ? base - 1 : base;
}
