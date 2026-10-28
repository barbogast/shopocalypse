// How item names are matched: by key (case and spacing don't matter), by name or plural

// Case and spacing don't matter when matching ingredient names to items
export function itemKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

// An item matches by its name and, if it has one, its plural
export function itemKeys(item: { name: string; plural: string | null }) {
  return item.plural ? [itemKey(item.name), itemKey(item.plural)] : [itemKey(item.name)];
}

// Common German and English plural endings
const PLURAL_ENDINGS = ["n", "en", "e", "er", "s", "es"];

// The item without a plural yet that a name is probably the plural of ("Knoblauchzehen" → Knoblauchzehe).
// Only good for a suggestion: German plurals are too irregular to match on this alone ("Mais" → "Mai").
export function likelySingular<T extends { name: string; plural: string | null }>(name: string, items: T[]): T | undefined {
  const key = itemKey(name);
  return items.find((i) => !i.plural && PLURAL_ENDINGS.some((ending) => itemKey(i.name) + ending === key));
}

// The key of the item a name stands for: an existing item's name and plural share its name's key
export function itemKeyIn(items: { name: string; plural: string | null }[]) {
  const keys = new Map(items.flatMap((i) => itemKeys(i).map((key) => [key, itemKey(i.name)] as const)));
  return (name: string) => keys.get(itemKey(name)) ?? itemKey(name);
}
