import { Checkbox, Select, TextInput } from "@mantine/core";
import { useState } from "react";
import { StoreShelfFields } from "~/components/store-shelf-fields";
import type { itemCategories, stores } from "~/db/schema";
import { UNIT_OPTIONS } from "~/units";

type Store = typeof stores.$inferSelect;
type Shelf = typeof itemCategories.$inferSelect;

// The item form's fields, read on the server by parseItemForm
export function ItemFields({
  stores,
  shelves,
  parents,
  defaults = {},
  autoFocus = false,
}: {
  stores: Store[];
  shelves: Shelf[];
  // Items it can be a variant of; leave out when it can't be one (it has variants itself)
  parents?: { id: number; name: string; storeId: number | null; categoryId: number | null }[];
  defaults?: {
    name?: string;
    plural?: string | null;
    parentId?: number | null;
    storeId?: number | null;
    categoryId?: number | null;
    defaultUnit?: string | null;
    alwaysAvailable?: boolean;
  };
  autoFocus?: boolean;
}) {
  const [parentId, setParentId] = useState(defaults.parentId ? String(defaults.parentId) : null);
  // Picking another parent prefills its store and shelf
  const newParent = parentId !== (defaults.parentId ? String(defaults.parentId) : null)
    ? parents?.find((p) => String(p.id) === parentId)
    : undefined;
  const location = newParent ?? defaults;

  return (
    <>
      {/* data-autofocus: focused when shown in a Mantine modal */}
      <TextInput
        name="name"
        label="Name"
        defaultValue={defaults.name}
        required
        autoFocus={autoFocus}
        data-autofocus={autoFocus || undefined}
      />
      <TextInput
        name="plural"
        label="Plural"
        description="Recipe imports match it too"
        defaultValue={defaults.plural ?? undefined}
      />
      {parents && (
        <Select
          name="parentId"
          label="Variant of"
          description="Listed under it, e.g. Berglinsen under Linsen"
          data={parents.map((p) => ({ value: String(p.id), label: p.name }))}
          value={parentId}
          onChange={setParentId}
          searchable
          clearable
          placeholder="None"
        />
      )}
      <StoreShelfFields
        key={parentId ?? "none"}
        stores={stores}
        shelves={shelves}
        defaultStoreId={location.storeId}
        defaultShelfId={location.categoryId}
      />
      <Select
        name="defaultUnit"
        label="Default unit"
        data={UNIT_OPTIONS}
        defaultValue={defaults.defaultUnit}
        clearable
        placeholder="None"
      />
      <Checkbox
        name="alwaysAvailable"
        label="Always available"
        description="Assumed to be in stock, so it's left off new shopping lists"
        defaultChecked={defaults.alwaysAvailable}
      />
    </>
  );
}
