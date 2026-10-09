import type { ComboboxItem, OptionsFilter } from "@mantine/core";

// Search filter for an item picker whose option values are item ids: finds items by their
// name or plural, and lists them by their plural if they have one ("Knoblauchzehen";
// picking it selects Knoblauchzehe). Options that aren't items stay.
export function itemSearchFilter(items: { id: number; name: string; plural: string | null }[]): OptionsFilter {
  const byId = new Map(items.map((i) => [String(i.id), i]));
  return ({ options, search }) => {
    const query = search.trim().toLocaleLowerCase();
    return (options as ComboboxItem[]).flatMap((o) => {
      const item = byId.get(o.value);
      if (!item) return [o];
      if (!o.label.toLocaleLowerCase().includes(query) && !item.plural?.toLocaleLowerCase().includes(query)) return [];
      // The label may add to the name, like "(on list)"
      return [item.plural ? { ...o, label: o.label.replace(item.name, item.plural) } : o];
    });
  };
}
