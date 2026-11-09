// Mantine palette colors for tags, in the order new tags get them. Gray and dark are left out,
// as gray marks archived and "nicht auffüllen" in the recipe list
export const TAG_COLORS = ["blue", "green", "orange", "grape", "teal", "red", "yellow", "indigo", "lime", "pink", "cyan", "violet"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

// The color fewest tags have, earliest in the palette on a tie, so up to a full palette all differ
export function nextTagColor(used: string[]): TagColor {
  const counts = new Map<string, number>();
  for (const c of used) counts.set(c, (counts.get(c) ?? 0) + 1);
  return TAG_COLORS.reduce((best, c) => ((counts.get(c) ?? 0) < (counts.get(best) ?? 0) ? c : best));
}
