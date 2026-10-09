import type { ComboboxItem, OptionsFilter } from "@mantine/core";

// Search filter for an item picker whose option values are item ids: also finds items
// by their plural, and shows the plural for those ("Knoblauchzehen" → Knoblauchzehen,
// picks Knoblauchzehe). Options that aren't items stay.
export function itemSearchFilter(items: { id: number; name: string; plural: string | null }[]): OptionsFilter {
  const byId = new Map(items.map((i) => [String(i.id), i]));
  return ({ options, search }) => {
    const query = search.trim().toLocaleLowerCase();
    return (options as ComboboxItem[]).flatMap((o) => {
      const item = byId.get(o.value);
      if (!item || o.label.toLocaleLowerCase().includes(query)) return [o];
      if (!item.plural?.toLocaleLowerCase().includes(query)) return [];
      // The label may add to the name, like "(on list)"
      return [{ ...o, label: o.label.replace(item.name, item.plural) }];
    });
  };
}
