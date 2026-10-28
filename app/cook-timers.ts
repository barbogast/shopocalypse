// Cooking times written in recipe instructions, such as "20 Minuten", "1 Min."
// or "15–20 Min.". A range counts as its lower bound, so the timer goes off
// early rather than late. Seconds are left out on purpose: in these recipes
// they're Thermomix settings ("30 Sek./Stufe 4"), which the machine times.
const DURATION =
  /(?<![\d.,])(\d+(?:,\d+)?)(?:\s*[-–]\s*\d+(?:,\d+)?)?\s*(?:Minuten|Minute|Min\.?)(?![a-zäöüß])/gi;

export type Duration = { index: number; text: string; seconds: number };

export function findDurations(text: string): Duration[] {
  return [...text.matchAll(DURATION)].map((m) => ({
    index: m.index,
    text: m[0],
    seconds: Math.round(Number(m[1].replace(",", ".")) * 60),
  }));
}

// "4:05", or "1:04:05" from an hour on; rounds up so a timer shows 0:00 only once it's done
export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
