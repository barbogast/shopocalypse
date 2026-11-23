// A date as YYYY-MM-DD in the local time zone; toISOString() would give the UTC date,
// which is the previous day shortly after midnight in Europe
export function localDate(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The YYYY-MM-DD date the given number of days earlier
export function daysBefore(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return localDate(new Date(year, month - 1, day - days));
}

// The German weekday of a YYYY-MM-DD date
export function weekdayName(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("de-DE", { weekday: "long", timeZone: "UTC" });
}

export function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

// The YYYY-MM-DD dates of a month ("YYYY-MM") in weeks from Monday to Sunday,
// with null for the days before the 1st and after the last
export function monthWeeks(month: string) {
  const [year, m] = month.split("-").map(Number);
  const days = new Date(year, m, 0).getDate();
  const leading = (new Date(year, m - 1, 1).getDay() + 6) % 7;
  const cells: (string | null)[] = Array(leading).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// The "YYYY-MM" month the given number of months later (or earlier, when negative)
export function addMonths(month: string, count: number) {
  const [year, m] = month.split("-").map(Number);
  return localDate(new Date(year, m - 1 + count, 1)).slice(0, 7);
}

// The German name and year of a "YYYY-MM" month, e.g. "November 2026"
export function monthName(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
}
