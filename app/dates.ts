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
