// Suggested store, shelf, unit, plural and parent for new items, from the way the existing ones are filed.
// The model's answer goes through sanitizeSuggestion, so only values that would pass the item form are kept.

import { itemKey, itemKeys } from "./item-names";
import { isUnitKey, UNITS, type UnitKey } from "./units";

export type Catalog = {
  stores: { id: number; name: string }[];
  shelves: { id: number; name: string; storeId: number }[];
  items: {
    id: number;
    name: string;
    plural: string | null;
    parentId: number | null;
    storeId: number | null;
    categoryId: number | null;
    defaultUnit: UnitKey | null;
  }[];
};

export type Suggestion = {
  // The name to use instead, when the one given is a plural ("Apfel" for "Äpfel"); the plural is then the name given
  singular: string | null;
  storeId: number | null;
  categoryId: number | null;
  defaultUnit: UnitKey | null;
  plural: string | null;
  parentId: number | null;
};

// The fields as the model returns them, before checking
export type RawSuggestion = {
  singular: string | null;
  storeId: number | null;
  categoryId: number | null;
  defaultUnit: string | null;
  plural: string | null;
  parentId: number | null;
};

// Drops whatever the item form would refuse: unknown ids, a shelf outside the store, a variant as parent,
// a singular or plural that's the name itself or another item's name or plural. The catalog leaves out the item itself.
export function sanitizeSuggestion(raw: RawSuggestion, name: string, catalog: Catalog): Suggestion {
  const storeId = catalog.stores.some((s) => s.id === raw.storeId) ? raw.storeId : null;
  const shelf = catalog.shelves.find((s) => s.id === raw.categoryId);
  const categoryId = shelf && shelf.storeId === storeId ? shelf.id : null;

  const parent = catalog.items.find((i) => i.id === raw.parentId);
  const parentId = parent && parent.parentId == null ? parent.id : null;

  const taken = new Set(catalog.items.flatMap(itemKeys));
  const rawSingular = raw.singular?.trim() || null;
  const singular = rawSingular && itemKey(rawSingular) !== itemKey(name) && !taken.has(itemKey(rawSingular)) ? rawSingular : null;
  // Renamed to the singular, the name given becomes the plural
  const plural = singular ? name : raw.plural?.trim() || null;
  const keepPlural = plural && itemKey(plural) !== itemKey(singular ?? name) && !taken.has(itemKey(plural));

  return {
    singular,
    storeId,
    categoryId,
    defaultUnit: isUnitKey(raw.defaultUnit) ? raw.defaultUnit : null,
    plural: keepPlural ? plural : null,
    parentId,
  };
}

// The catalog as text for the prompt: each store's shelves in walking order with their items,
// then items without a shelf or store
export function describeCatalog(catalog: Catalog) {
  const describeItem = (i: Catalog["items"][number]) => {
    const parent = i.parentId != null ? catalog.items.find((p) => p.id === i.parentId) : undefined;
    const details = [
      i.defaultUnit && `unit ${i.defaultUnit}`,
      i.plural && `plural ${i.plural}`,
      parent && `variant of ${parent.name}`,
    ].filter(Boolean);
    return `  - ${i.name} (item id ${i.id})${details.length ? `: ${details.join(", ")}` : ""}`;
  };

  const lines: string[] = [];
  for (const store of catalog.stores) {
    lines.push(`Store "${store.name}" (store id ${store.id})`);
    for (const shelf of catalog.shelves.filter((s) => s.storeId === store.id)) {
      lines.push(` Shelf "${shelf.name}" (shelf id ${shelf.id})`);
      lines.push(...catalog.items.filter((i) => i.categoryId === shelf.id).map(describeItem));
    }
    const unshelved = catalog.items.filter((i) => i.storeId === store.id && i.categoryId == null);
    if (unshelved.length) lines.push(" No shelf", ...unshelved.map(describeItem));
  }
  const homeless = catalog.items.filter((i) => i.storeId == null);
  if (homeless.length) lines.push("No store", ...homeless.map(describeItem));

  lines.push("", `Unit keys: ${UNITS.map((u) => `${u.key} (${u.plural})`).join(", ")}`);
  return lines.join("\n");
}
