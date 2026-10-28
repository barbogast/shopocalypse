import { Button, Group, Modal, Select, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { type ReactNode, useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { FormError } from "~/components/form-error";
import { ItemFields } from "~/components/item-fields";
import { itemSearchFilter } from "~/components/item-search";
import type * as schema from "~/db/schema";
import { itemKey, itemKeys } from "~/item-names";
import type { action as createAction } from "~/routes/items.create";

export type PickerItem = { id: number; name: string; plural: string | null; defaultUnit: string | null };

// A searchable item select for a form, submitted as `name`. Searching for an item that doesn't
// exist yet offers to create it in a modal; the new item is then picked through onCreated.
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
  // Prefilled in the new item's form
  defaultUnit: string | null;
  stores: (typeof schema.stores.$inferSelect)[];
  shelves: (typeof schema.itemCategories.$inferSelect)[];
  parents: { id: number; name: string; storeId: number | null; categoryId: number | null }[];
}) {
  const [opened, modal] = useDisclosure(false);
  const [createName, setCreateName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fetcher = useFetcher<typeof createAction>();

  // Offer to create the searched-for item when no item has that name or plural yet
  const searchName = search.trim();
  const canCreate = searchName !== "" && !items.some((i) => itemKeys(i).includes(itemKey(searchName)));
  const options = items.filter((i) => !hidden?.(i)).map((i) => ({ value: String(i.id), label: optionLabel(i) }));
  if (canCreate) options.push({ value: "__create__", label: `+ Create "${searchName}"` });

  // Arrives before the page's loader reruns, so the new item isn't in items yet
  useEffect(() => {
    if (fetcher.data && "error" in fetcher.data) setError(fetcher.data.error ?? null);
    if (fetcher.data && "item" in fetcher.data && fetcher.data.item) {
      modal.close();
      onCreated(fetcher.data.item);
    }
  }, [fetcher.data]);

  return (
    <>
      <Select
        name={name}
        label={label}
        placeholder="Search or create…"
        data={options}
        value={value}
        searchable
        filter={itemSearchFilter(items)}
        searchValue={search}
        onSearchChange={onSearchChange}
        onChange={(picked) => {
          if (picked === "__create__") {
            setCreateName(searchName);
            setError(null);
            modal.open();
          } else {
            onSelect(items.find((i) => String(i.id) === picked));
          }
        }}
        style={{ flex: 1, minWidth: 140 }}
      />

      {/* No returnFocus: it would take focus back from the next field to the item picker.
          The modal sits in a portal, but React still bubbles its submit to a form around the picker */}
      <Modal opened={opened} onClose={modal.close} title="New item" returnFocus={false}>
        <fetcher.Form method="post" action="/items/create" onSubmit={(e) => e.stopPropagation()}>
          <Stack>
            <ItemFields
              stores={stores}
              shelves={shelves}
              parents={parents}
              defaults={{ name: createName, defaultUnit }}
              autoFocus
            />
            <FormError error={error} />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={modal.close}>Cancel</Button>
              <Button type="submit" loading={fetcher.state !== "idle"}>Create</Button>
            </Group>
          </Stack>
        </fetcher.Form>
      </Modal>
    </>
  );
}
