import type { ComboboxItem, OptionsFilter } from "@mantine/core";

// Search filter for an item picker whose option values are item ids: also finds items
// by their plural ("Knoblauchzehen" → Knoblauchzehe). Options that aren't items stay.
export function itemSearchFilter(items: { id: number; plural: string | null }[]): OptionsFilter {
  const plurals = new Map(items.map((i) => [String(i.id), i.plural?.toLocaleLowerCase()]));
  return ({ options, search }) => {
    const query = search.trim().toLocaleLowerCase();
    return (options as ComboboxItem[]).filter((o) =>
      !plurals.has(o.value) || o.label.toLocaleLowerCase().includes(query) || plurals.get(o.value)?.includes(query));
  };
}
