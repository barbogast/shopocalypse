import { ActionIcon, Button, Group, NumberInput, Select, TextInput } from "@mantine/core";
import { IconDeviceFloppy, IconPlus, IconX } from "@tabler/icons-react";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import { Form, useActionData } from "react-router";
import { FormError } from "~/components/form-error";
import { CreateItemModal, ItemPicker, type PickerItem } from "~/components/item-picker";
import { int } from "~/forms";
import { StoreShelfFields } from "~/components/store-shelf-fields";
import { SubmitButton } from "~/components/submit-button";
import type { action, ActiveListData } from "~/routes/shopping";
import { DEFAULT_UNIT, UNIT_OPTIONS } from "~/units";

// Manually add an item; the unit starts on the item's default unit.
// A name no item has goes on this list only (a one-off), optionally with a store
// and shelf, unless it's saved as an item first with "Zutat permanent speichern"
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
  // What the new item's form starts from; kept after closing, so the fields don't empty during the close animation
  const [createDefaults, setCreateDefaults] = useState<ComponentProps<typeof CreateItemModal>["defaults"]>({});
  const [createOpened, setCreateOpened] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
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

  // The new item starts from what was entered for the one-off
  const saveAsItem = () => {
    const form = new FormData(formRef.current!);
    setCreateDefaults({ name: oneOff ?? "", storeId: int(form, "storeId"), categoryId: int(form, "categoryId"), defaultUnit: unit });
    setCreateOpened(true);
  };

  // Once a one-off is on the list, the next thing added is most likely an item again
  useEffect(() => {
    if (actionData && "oneOffAdded" in actionData) backToPicker();
  }, [actionData]);

  return (
    <Form method="post" ref={formRef}>
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
            onCreated={selectItem}
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
        <Group align="flex-end" gap="xs" mt="xs">
          <Group grow gap="xs" style={{ flex: 1, minWidth: 240 }}>
            <StoreShelfFields stores={stores} shelves={shelves} />
          </Group>
          <Button variant="light" leftSection={<IconDeviceFloppy size={16} />} onClick={saveAsItem}>
            Zutat permanent speichern
          </Button>
        </Group>
      )}
      <CreateItemModal
        opened={createOpened}
        onClose={() => setCreateOpened(false)}
        // Picked in place of the one-off; the amount entered stays
        onCreated={(item) => {
          setOneOff(null);
          selectItem(item);
          quantityRef.current?.focus();
        }}
        defaults={createDefaults}
        stores={stores}
        shelves={shelves}
        parents={parents}
      />
      <FormError error={actionData && "addError" in actionData ? actionData.addError : null} mt="xs" />
    </Form>
  );
}
