import { Group, NumberInput, Select } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { Form, useActionData } from "react-router";
import { FormError } from "~/components/form-error";
import { ItemPicker, type PickerItem } from "~/components/item-picker";
import { SubmitButton } from "~/components/submit-button";
import type { action, ActiveListData } from "~/routes/shopping";
import { DEFAULT_UNIT, UNIT_OPTIONS } from "~/units";

// Manually add an item; the unit starts on the item's default unit.
// Searching for an item that doesn't exist yet offers to create it
export function AddItemForm({ items, stores, shelves, parents }: {
  items: ActiveListData["allItems"];
  stores: ActiveListData["allStores"];
  shelves: ActiveListData["allShelves"];
  parents: ActiveListData["parents"];
}) {
  const [itemId, setItemId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState<string | null>(DEFAULT_UNIT);
  const quantityRef = useRef<HTMLInputElement>(null);
  const actionData = useActionData<typeof action>();

  const selectItem = (item: PickerItem | undefined) => {
    setItemId(item ? String(item.id) : null);
    setSearch(item?.name ?? "");
    setUnit(item?.defaultUnit ?? DEFAULT_UNIT);
  };

  return (
    <Form method="post">
      <input type="hidden" name="intent" value="add-manual" />
      <Group align="flex-end" gap="xs">
        <ItemPicker
          name="itemId"
          label="Artikel hinzufügen"
          items={items}
          optionLabel={(i) => (i.listed ? `${i.name} (auf der Liste)` : i.name)}
          value={itemId}
          search={search}
          onSearchChange={setSearch}
          onSelect={selectItem}
          onCreated={(item) => {
            selectItem(item);
            quantityRef.current?.focus();
          }}
          defaultUnit={unit}
          stores={stores}
          shelves={shelves}
          parents={parents}
        />
        <NumberInput ref={quantityRef} name="quantity" label="Menge" min={0} decimalScale={2} decimalSeparator=","
          placeholder="—" style={{ width: 70 }} />
        <Select name="unit" label="Einheit" data={UNIT_OPTIONS} value={unit} onChange={setUnit} style={{ width: 120 }} />
        <SubmitButton leftSection={<IconPlus size={16} />}>Hinzufügen</SubmitButton>
      </Group>
      <FormError error={actionData && "addError" in actionData ? actionData.addError : null} mt="xs" />
    </Form>
  );
}
