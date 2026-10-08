import { Checkbox, Select, Text, TextInput } from "@mantine/core";
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
  parents?: { id: number; name: string }[];
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
  const parentName = parents?.find((p) => String(p.id) === parentId)?.name;

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
      {parentName ? (
        <Text size="sm" c="dimmed">Store and shelf: same as {parentName}</Text>
      ) : (
        <StoreShelfFields
          stores={stores}
          shelves={shelves}
          defaultStoreId={defaults.storeId}
          defaultShelfId={defaults.categoryId}
        />
      )}
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
