import { ActionIcon, Group, NumberInput, Select, TextInput } from "@mantine/core";
import { IconPlus, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Form, useActionData } from "react-router";
import { FormError } from "~/components/form-error";
import { ItemPicker, type PickerItem } from "~/components/item-picker";
import { StoreShelfFields } from "~/components/store-shelf-fields";
import { SubmitButton } from "~/components/submit-button";
import type { action, ActiveListData } from "~/routes/shopping";
import { DEFAULT_UNIT, UNIT_OPTIONS } from "~/units";

// Manually add an item; the unit starts on the item's default unit.
// Searching for an item that doesn't exist yet offers to create it, or to put it
// on this list only (a one-off), optionally with a store and shelf
export function AddItemForm({ items, stores, shelves, parents }: {
  items: ActiveListData["allItems"];
  stores: ActiveListData["allStores"];
  shelves: ActiveListData["allShelves"];
  parents: ActiveListData["parents"];
}) {
  const [itemId, setItemId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState<string | null>(DEFAULT_UNIT);
  // The one-off's name while adding one, null while picking an item
  const [oneOff, setOneOff] = useState<string | null>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const actionData = useActionData<typeof action>();

  const selectItem = (item: PickerItem | undefined) => {
    setItemId(item ? String(item.id) : null);
    setSearch(item?.name ?? "");
    setUnit(item?.defaultUnit ?? DEFAULT_UNIT);
  };

  const backToPicker = () => {
    setOneOff(null);
    selectItem(undefined);
  };

  // Once a one-off is on the list, the next thing added is most likely an item again
  useEffect(() => {
    if (actionData && "oneOffAdded" in actionData) backToPicker();
  }, [actionData]);

  return (
    <Form method="post">
      <input type="hidden" name="intent" value={oneOff == null ? "add-manual" : "add-one-off"} />
      <Group align="flex-end" gap="xs">
        {oneOff == null ? (
          <ItemPicker
            name="itemId"
            label="Zutat hinzufügen"
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
            onOneOff={(name) => {
              setOneOff(name);
              setItemId(null);
              quantityRef.current?.focus();
            }}
            defaultUnit={unit}
            stores={stores}
            shelves={shelves}
            parents={parents}
          />
        ) : (
          <TextInput
            name="name"
            label="Nur auf diese Liste"
            value={oneOff}
            onChange={(e) => setOneOff(e.currentTarget.value)}
            required
            rightSection={
              <ActionIcon variant="subtle" color="gray" onClick={backToPicker} aria-label="Doch eine Zutat wählen">
                <IconX size={14} />
              </ActionIcon>
            }
            style={{ flex: 1, minWidth: 140 }}
          />
        )}
        <NumberInput ref={quantityRef} name="quantity" label="Menge" min={0} decimalScale={2} decimalSeparator=","
          placeholder="—" style={{ width: 70 }} />
        <Select name="unit" label="Einheit" data={UNIT_OPTIONS} value={unit} onChange={setUnit} style={{ width: 120 }} />
        <SubmitButton leftSection={<IconPlus size={16} />}>Hinzufügen</SubmitButton>
      </Group>
      {/* Both optional: without a store it's listed under "Sonstige" */}
      {oneOff != null && (
        <Group grow gap="xs" mt="xs">
          <StoreShelfFields stores={stores} shelves={shelves} />
        </Group>
      )}
      <FormError error={actionData && "addError" in actionData ? actionData.addError : null} mt="xs" />
    </Form>
  );
}
