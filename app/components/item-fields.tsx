import { Checkbox, Select, TextInput } from "@mantine/core";
import { StoreShelfFields } from "~/components/store-shelf-fields";
import { UNIT_OPTIONS } from "~/units";

type Store = { id: number; name: string };
type Shelf = { id: number; name: string; storeId: number };

// The item form's fields, read on the server by parseItemForm
export function ItemFields({
  stores,
  shelves,
  defaults = {},
  autoFocus = false,
}: {
  stores: Store[];
  shelves: Shelf[];
  defaults?: {
    name?: string;
    storeId?: number | null;
    categoryId?: number | null;
    defaultUnit?: string | null;
    alwaysAvailable?: boolean;
  };
  autoFocus?: boolean;
}) {
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
      <StoreShelfFields
        stores={stores}
        shelves={shelves}
        defaultStoreId={defaults.storeId}
        defaultShelfId={defaults.categoryId}
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
