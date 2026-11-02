// Reordering a list by drag and drop: the new order travels as a comma-separated list of ids

// The ids in a submitted order, or null unless they're distinct positive whole numbers
export function parseOrder(value: FormDataEntryValue | null): number[] | null {
  if (typeof value !== "string" || !value) return null;
  const ids = value.split(",").map(Number);
  if (!ids.every((id) => Number.isInteger(id) && id >= 1)) return null;
  return new Set(ids).size === ids.length ? ids : null;
}

// Whether a submitted order has exactly the current ids; it doesn't when the list
// changed in the meantime (e.g. on another phone), and is then ignored
export function sameIds(current: number[], order: number[]): boolean {
  const set = new Set(current);
  return current.length === order.length && order.every((id) => set.has(id));
}

// The items in the given order of ids, or as they are when the ids no longer match them
export function inOrder<T>(items: T[], idOf: (item: T) => number, order: number[] | null): T[] {
  if (!order || !sameIds(items.map(idOf), order)) return items;
  const byId = new Map(items.map((item) => [idOf(item), item]));
  return order.map((id) => byId.get(id)!);
}

// The ids after moving the one at `from` to `to`
export function moved(ids: number[], from: number, to: number): number[] {
  const result = [...ids];
  const [id] = result.splice(from, 1);
  result.splice(to, 0, id);
  return result;
}
