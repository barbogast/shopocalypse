// Fixed list of quantity units. Mass and volume units share a kind and are added
// up via their factor (to g / ml); every other unit is its own kind.
export const UNITS = [
  { key: "g", label: "g", plural: "g", kind: "mass", factor: 1 },
  { key: "kg", label: "kg", plural: "kg", kind: "mass", factor: 1000 },
  { key: "ml", label: "ml", plural: "ml", kind: "volume", factor: 1 },
  { key: "l", label: "l", plural: "l", kind: "volume", factor: 1000 },
  { key: "pcs", label: "pc", plural: "pcs", kind: "pcs", factor: 1 },
  { key: "tsp", label: "tsp", plural: "tsp", kind: "tsp", factor: 1 },
  { key: "tbsp", label: "tbsp", plural: "tbsp", kind: "tbsp", factor: 1 },
  { key: "pinch", label: "pinch", plural: "pinches", kind: "pinch", factor: 1 },
  { key: "can", label: "can", plural: "cans", kind: "can", factor: 1 },
  { key: "jar", label: "jar", plural: "jars", kind: "jar", factor: 1 },
  { key: "pack", label: "pack", plural: "packs", kind: "pack", factor: 1 },
  { key: "bottle", label: "bottle", plural: "bottles", kind: "bottle", factor: 1 },
  { key: "crate", label: "crate", plural: "crates", kind: "crate", factor: 1 },
  { key: "bunch", label: "bunch", plural: "bunches", kind: "bunch", factor: 1 },
] as const;

export type UnitKey = (typeof UNITS)[number]["key"];

// A quantity without a unit means "no quantity" (e.g. spices): both are null
export type Amount = { quantity: number | null; unit: UnitKey | null };

export const DEFAULT_UNIT: UnitKey = "pcs";

export const UNIT_OPTIONS = UNITS.map((u) => ({ value: u.key, label: u.plural }));

const unitsByKey = new Map<string, (typeof UNITS)[number]>(UNITS.map((u) => [u.key, u]));

// The name shown in unit pickers, e.g. "bottles"
export function unitName(key: UnitKey) {
  return unitsByKey.get(key)?.plural ?? key;
}

export function isUnitKey(value: unknown): value is UnitKey {
  return typeof value === "string" && unitsByKey.has(value);
}

// Reads an optional quantity + unit pair from a form; an empty quantity means no quantity
export function parseAmount(form: FormData): { amount: Amount } | { error: string } {
  const rawQuantity = String(form.get("quantity") ?? "").trim();
  if (!rawQuantity) return { amount: { quantity: null, unit: null } };
  const quantity = Number(rawQuantity);
  const unit = form.get("unit");
  if (!(quantity > 0)) return { error: "Quantity must be more than 0." };
  if (!isUnitKey(unit)) return { error: "Pick a unit." };
  return { amount: { quantity, unit } };
}

// Adds up amounts: mass and volume across their units, everything else per unit.
// Amounts without a quantity are dropped.
export function combineAmounts(amounts: Amount[]): Amount[] {
  const totals = new Map<string, number>();
  for (const { quantity, unit } of amounts) {
    if (quantity == null || unit == null) continue;
    const def = unitsByKey.get(unit)!;
    totals.set(def.kind, (totals.get(def.kind) ?? 0) + quantity * def.factor);
  }
  return [...totals].map(([kind, total]) => {
    if (kind === "mass") return total >= 1000 ? { quantity: total / 1000, unit: "kg" } : { quantity: total, unit: "g" };
    if (kind === "volume") return total >= 1000 ? { quantity: total / 1000, unit: "l" } : { quantity: total, unit: "ml" };
    return { quantity: total, unit: kind as UnitKey };
  });
}

const numberFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

export function formatAmount({ quantity, unit }: Amount) {
  if (quantity == null || unit == null) return "—";
  const def = unitsByKey.get(unit);
  if (!def) return numberFormat.format(quantity);
  return `${numberFormat.format(quantity)} ${quantity === 1 ? def.label : def.plural}`;
}

export function formatAmounts(amounts: Amount[]) {
  const combined = combineAmounts(amounts);
  return combined.length ? combined.map(formatAmount).join(" + ") : "—";
}
