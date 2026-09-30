import { Select } from "@mantine/core";
import { useState } from "react";

type Store = { id: number; name: string };
type Shelf = { id: number; name: string; storeId: number };

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
        label="Store"
        data={stores.map((s) => ({ value: String(s.id), label: s.name }))}
        value={storeId}
        onChange={(value) => {
          setStoreId(value);
          setShelfId(null);
        }}
        clearable
        placeholder="None"
      />
      <Select
        name="categoryId"
        label="Shelf"
        data={storeShelves.map((s) => ({ value: String(s.id), label: s.name }))}
        value={shelfId}
        onChange={setShelfId}
        disabled={!storeId}
        clearable
        placeholder={!storeId ? "Pick a store first" : storeShelves.length ? "None" : "This store has no shelves yet"}
      />
    </>
  );
}
