import { Select } from "@mantine/core";
import { useState } from "react";
import type * as schema from "~/db/schema";

type Store = typeof schema.stores.$inferSelect;
type Shelf = typeof schema.itemCategories.$inferSelect;

// Store and shelf pickers for the item form; only the chosen store's shelves are offered
export function StoreShelfFields({
  stores,
  shelves,
  defaultStoreId = null,
  defaultShelfId = null,
}: {
  stores: Store[];
  shelves: Shelf[];
  defaultStoreId?: number | null;
  defaultShelfId?: number | null;
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
        value={storeId}
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
        value={shelfId}
        onChange={setShelfId}
        disabled={!storeId}
        clearable
        placeholder={!storeId ? "Zuerst einen Laden wählen" : storeShelves.length ? "Keins" : "Dieser Laden hat noch keine Regale"}
      />
    </>
  );
}
