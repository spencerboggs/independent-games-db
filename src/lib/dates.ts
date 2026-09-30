export type DatePrecision = "day" | "month" | "year";

export interface ParsedDate {
  date: string;
  precision: DatePrecision;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Parses the English store date formats Steam uses ("Feb 24, 2017",
 * "24 Feb, 2017", "February 2027", "Q1 2027", "2027"). Returns null for
 * placeholders such as "Coming soon" or "To be announced".
 */
export function parseStoreDate(input: string | null | undefined): ParsedDate | null {
  if (!input) return null;
  const s = input.trim().replace(/\s+/g, " ");
  let m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/);
  if (m) return build(m[3]!, m[1]!, m[2]!);
  m = s.match(/^(\d{1,2}) ([A-Za-z]{3,9})\.?,? (\d{4})$/);
  if (m) return build(m[3]!, m[2]!, m[1]!);
  m = s.match(/^([A-Za-z]{3,9}),? (\d{4})$/);
  if (m) {
    const month = MONTHS[m[1]!.slice(0, 3).toLowerCase()];
    if (month) return { date: `${m[2]}-${pad(month)}`, precision: "month" };
  }
  m = s.match(/^(?:Q[1-4] )?(\d{4})$/);
  if (m) return { date: m[1]!, precision: "year" };
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, precision: "day" };
  return null;
}

function build(year: string, monthName: string, day: string): ParsedDate | null {
  const month = MONTHS[monthName.slice(0, 3).toLowerCase()];
  if (!month) return null;
  return { date: `${year}-${pad(month)}-${pad(Number(day))}`, precision: "day" };
}

export function precisionOf(date: string | null): DatePrecision | null {
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return "day";
  if (/^\d{4}-\d{2}$/.test(date)) return "month";
  return "year";
}

export function unixToDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/** Days between an ISO partial date (earliest interpretation) and `now`. */
export function daysSince(date: string, now: Date): number {
  const [y, m = "01", d = "01"] = date.split("-");
  const t = Date.UTC(Number(y), Number(m) - 1, Number(d));
  return Math.max(0, (now.getTime() - t) / 86_400_000);
}

export function yearOf(date: string | null): string | null {
  return date ? date.slice(0, 4) : null;
}

/** Compares partial dates; null sorts last. */
export function compareDates(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
