import { Button, Group, Modal, Select, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { type ComponentProps, type ReactNode, useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { FormError } from "~/components/form-error";
import { ItemFields } from "~/components/item-fields";
import { itemSearchFilter } from "~/components/item-search";
import type * as schema from "~/db/schema";
import { itemKey, itemKeys } from "~/item-names";
import type { action as createAction } from "~/routes/items.create";

export type PickerItem = { id: number; name: string; plural: string | null; defaultUnit: string | null };

type Stores = (typeof schema.stores.$inferSelect)[];
type Shelves = (typeof schema.itemCategories.$inferSelect)[];
type Parents = { id: number; name: string; storeId: number | null; categoryId: number | null }[];

// A searchable item select for a form, submitted as `name`. Searching for an item that doesn't
// exist yet offers to create it in a modal; the new item is then picked through onCreated.
// With onOneOff, it offers to use the name just once instead, and the caller offers creating it.
// The parent keeps the picked id and the search text, so it can fill them in itself.
export function ItemPicker<T extends PickerItem>({
  name,
  label,
  items,
  hidden,
  optionLabel = (item) => item.name,
  value,
  search,
  onSearchChange,
  onSelect,
  onCreated,
  onOneOff,
  defaultUnit,
  stores,
  shelves,
  parents,
}: {
  name: string;
  label: ReactNode;
  // All items: a name any of them has can't be created again
  items: T[];
  // Items left out of the options, like ingredients the recipe has already
  hidden?: (item: T) => boolean;
  optionLabel?: (item: T) => string;
  value: string | null;
  search: string;
  onSearchChange: (search: string) => void;
  onSelect: (item: T | undefined) => void;
  onCreated: (item: PickerItem) => void;
  // Picked a name no item has, to use without creating an item
  onOneOff?: (name: string) => void;
  // Prefilled in the new item's form
  defaultUnit: string | null;
  stores: Stores;
  shelves: Shelves;
  parents: Parents;
}) {
  const [opened, modal] = useDisclosure(false);
  const [createName, setCreateName] = useState("");

  // Offer the searched-for name when no item has it as name or plural yet
  const searchName = search.trim();
  const isNew = searchName !== "" && !items.some((i) => itemKeys(i).includes(itemKey(searchName)));
  const options = items.filter((i) => !hidden?.(i)).map((i) => ({ value: String(i.id), label: optionLabel(i) }));
  if (isNew && onOneOff) options.push({ value: "__one_off__", label: `+ „${searchName}“ hinzufügen` });
  else if (isNew) options.push({ value: "__create__", label: `+ „${searchName}“ anlegen` });

  return (
    <>
      <Select
        name={name}
        label={label}
        placeholder={onOneOff ? "Suchen oder neu eingeben…" : "Suchen oder anlegen…"}
        data={options}
        value={value}
        searchable
        filter={itemSearchFilter(items)}
        searchValue={search}
        onSearchChange={onSearchChange}
        onChange={(picked) => {
          if (picked === "__one_off__") {
            onOneOff?.(searchName);
          } else if (picked === "__create__") {
            setCreateName(searchName);
            modal.open();
          } else {
            onSelect(items.find((i) => String(i.id) === picked));
          }
        }}
        style={{ flex: 1, minWidth: 140 }}
      />
      <CreateItemModal
        opened={opened}
        onClose={modal.close}
        onCreated={onCreated}
        defaults={{ name: createName, defaultUnit }}
        stores={stores}
        shelves={shelves}
        parents={parents}
      />
    </>
  );
}

// The "Neue Zutat" form in a modal; the new item comes back through onCreated
export function CreateItemModal({ opened, onClose, onCreated, defaults, stores, shelves, parents }: {
  opened: boolean;
  onClose: () => void;
  onCreated: (item: PickerItem) => void;
  // The fields start from these each time it opens
  defaults: ComponentProps<typeof ItemFields>["defaults"];
  stores: Stores;
  shelves: Shelves;
  parents: Parents;
}) {
  const [error, setError] = useState<string | null>(null);
  const fetcher = useFetcher<typeof createAction>();

  useEffect(() => {
    if (opened) setError(null);
  }, [opened]);

  // Arrives before the page's loader reruns, so the new item isn't in the page's items yet
  useEffect(() => {
    if (fetcher.data && "error" in fetcher.data) setError(fetcher.data.error ?? null);
    if (fetcher.data && "item" in fetcher.data && fetcher.data.item) {
      onClose();
      onCreated(fetcher.data.item);
    }
  }, [fetcher.data]);

  return (
    // No returnFocus: it would take focus back from the next field to what opened it.
    // The modal sits in a portal, but React still bubbles its submit to a form around it
    <Modal opened={opened} onClose={onClose} title="Neue Zutat" returnFocus={false}>
      <fetcher.Form method="post" action="/items/create" onSubmit={(e) => e.stopPropagation()}>
        <Stack>
          <ItemFields stores={stores} shelves={shelves} parents={parents} defaults={defaults} autoFocus />
          <FormError error={error} />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose}>Abbrechen</Button>
            <Button type="submit" loading={fetcher.state !== "idle"}>Anlegen</Button>
          </Group>
        </Stack>
      </fetcher.Form>
    </Modal>
  );
}
