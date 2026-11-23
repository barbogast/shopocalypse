import { Select } from "@mantine/core";
import { useState } from "react";
import type * as schema from "~/db/schema";

type Store = typeof schema.stores.$inferSelect;
type Shelf = typeof schema.itemCategories.$inferSelect;

// Store and shelf pickers for the item form; only the chosen store's shelves are offered.
// Disabled, they show and submit neither, but turned back on they have the choice from before.
export function StoreShelfFields({
  stores,
  shelves,
  defaultStoreId = null,
  defaultShelfId = null,
  disabled = false,
}: {
  stores: Store[];
  shelves: Shelf[];
  defaultStoreId?: number | null;
  defaultShelfId?: number | null;
  disabled?: boolean;
}) {
  const [storeId, setStoreId] = useState(defaultStoreId ? String(defaultStoreId) : null);
  const [shelfId, setShelfId] = useState(defaultShelfId ? String(defaultShelfId) : null);
  const storeShelves = shelves.filter((s) => String(s.storeId) === storeId);

  return (
    <>
      <Select
        name="storeId"
        label="Laden"
        data={stores.map((s) => ({ value: String(s.id), label: s.name }))}
        value={disabled ? null : storeId}
        disabled={disabled}
        onChange={(value) => {
          setStoreId(value);
          setShelfId(null);
        }}
        clearable
        placeholder="Keiner"
      />
      <Select
        name="categoryId"
        label="Regal"
        data={storeShelves.map((s) => ({ value: String(s.id), label: s.name }))}
        value={disabled ? null : shelfId}
        onChange={setShelfId}
        disabled={disabled || !storeId}
        clearable
        placeholder={disabled ? "Keins" : !storeId ? "Zuerst einen Laden wählen" : storeShelves.length ? "Keins" : "Dieser Laden hat noch keine Regale"}
      />
    </>
  );
}
