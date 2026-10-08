// Group items by store, then by shelf (keeps the given order)
export function groupByStoreAndShelf<T extends { storeName: string | null; shelfName: string | null }>(listItems: T[]) {
  const groups = new Map<string, Map<string | null, T[]>>();
  for (const item of listItems) {
    const storeKey = item.storeName ?? "Other";
    const shelfKey = item.shelfName;
    if (!groups.has(storeKey)) groups.set(storeKey, new Map());
    const shelves = groups.get(storeKey)!;
    if (!shelves.has(shelfKey)) shelves.set(shelfKey, []);
    shelves.get(shelfKey)!.push(item);
  }
  return groups;
}
