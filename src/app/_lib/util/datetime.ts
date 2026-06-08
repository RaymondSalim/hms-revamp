import { differenceInCalendarMonths } from "date-fns";

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
export function countMonths(start: Date, end: Date): number {
  const [earlier, later] = start <= end ? [start, end] : [end, start];
  const base = differenceInCalendarMonths(later, earlier) + 1;
  return earlier.getDate() !== 1 ? base - 1 : base;
}
