import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Container,
  Divider,
  Group,
  Popover,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconPencil, IconPlus, IconToolsKitchen2, IconTrash, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { Form, Link, useFetcher, useSearchParams } from "react-router";
import { MoveButtons } from "~/components/move-buttons";
import { db } from "~/db/client";
import { addShelf, deleteItem, deleteShelf, deleteStore, listShelves, moveShelf } from "~/db/items.server";
import { itemCategories, items, recipeIngredients, recipes, stores } from "~/db/schema";
import { int, text } from "~/forms";
import { groupByStoreAndShelf } from "~/store-shelf-groups";
import { unitName } from "~/units";
import type { Route } from "./+types/items";

export function meta() {
  return [{ title: "Items – Shopocalypse" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const byShelf = new URL(request.url).searchParams.get("by") === "shelf";
  const parents = alias(items, "parents");
  const allItems = await db
    .select({
      id: items.id,
      name: items.name,
      // Grouped by shelf, a variant is only indented under its parent when they share a shelf
      isVariant: byShelf
        ? sql<boolean>`${items.parentId} is not null and ${parents.storeId} is ${items.storeId} and ${parents.categoryId} is ${items.categoryId}`.mapWith(Boolean)
        : sql<boolean>`${items.parentId} is not null`.mapWith(Boolean),
      defaultUnit: items.defaultUnit,
      alwaysAvailable: items.alwaysAvailable,
      shelfName: itemCategories.name,
      storeName: stores.name,
    })
    .from(items)
    .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
    .leftJoin(stores, eq(items.storeId, stores.id))
    .leftJoin(parents, eq(items.parentId, parents.id))
    // Like the shopping list when grouped by shelf: stores alphabetically, then shelves in walking order,
    // items without a store or shelf last. Variants right after their parent (on the same shelf)
    .orderBy(
      ...(byShelf
        ? [
            sql`${stores.name} is null`,
            stores.name,
            sql`${itemCategories.position} is null`,
            itemCategories.position,
          ]
        : []),
      sql`coalesce(${parents.name}, ${items.name})`,
      sql`${items.parentId} is not null`,
      items.name,
    );

  const allShelves = await listShelves();
  const allStores = await db.select().from(stores).orderBy(stores.name);

  // Recipes each item is used in
  const usage = await db
    .selectDistinct({ itemId: recipeIngredients.itemId, id: recipes.id, name: recipes.name, archived: recipes.archived })
    .from(recipeIngredients)
    .innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
    .orderBy(recipes.name);
  const recipesByItem: Record<number, typeof usage> = {};
  for (const row of usage) (recipesByItem[row.itemId] ??= []).push(row);

  return { allItems, allShelves, allStores, recipesByItem };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent");
  const id = int(form, "id");
  const name = text(form, "name");

  switch (intent) {
    case "delete-item": {
      if (id) await deleteItem(id);
      break;
    }

    case "add-shelf": {
      const storeId = int(form, "storeId");
      if (storeId && name) await addShelf(storeId, name);
      break;
    }

    case "rename-shelf": {
      if (id && name) await db.update(itemCategories).set({ name }).where(eq(itemCategories.id, id));
      break;
    }

    case "move-shelf": {
      if (id) await moveShelf(id, form.get("direction") === "up");
      break;
    }

    case "delete-shelf": {
      if (id) await deleteShelf(id);
      break;
    }

    case "add-store": {
      if (name) await db.insert(stores).values({ name });
      break;
    }

    case "rename-store": {
      if (id && name) await db.update(stores).set({ name }).where(eq(stores.id, id));
      break;
    }

    case "delete-store": {
      if (id) await deleteStore(id);
      break;
    }
    default:
      throw new Response("Unknown intent", { status: 400 });
  }

  return null;
}

// Name with a pencil that swaps it for an inline rename form
function RenamableName({ intent, id, name, fw, size }: {
  intent: string;
  id: number;
  name: string;
  fw?: number;
  size?: "sm";
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <Group gap={4} wrap="nowrap">
        <Text fw={fw} size={size}>{name}</Text>
        <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setEditing(true)} aria-label={`Rename ${name}`}>
          <IconPencil size={14} />
        </ActionIcon>
      </Group>
    );
  }

  return (
    <Form method="post" onSubmit={() => setEditing(false)} style={{ flex: 1 }}>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={id} />
      <Group gap={4} wrap="nowrap">
        <TextInput
          name="name"
          defaultValue={name}
          size="xs"
          required
          autoFocus
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          style={{ flex: 1 }}
        />
        <ActionIcon type="submit" variant="subtle" color="green" size="sm" aria-label="Save name">
          <IconCheck size={14} />
        </ActionIcon>
        <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setEditing(false)} aria-label="Cancel rename">
          <IconX size={14} />
        </ActionIcon>
      </Group>
    </Form>
  );
}

// Name field with an Add button; clears the field once the add went through
function AddNameForm({ intent, storeId, placeholder, size }: {
  intent: string;
  storeId?: number;
  placeholder: string;
  size?: "xs";
}) {
  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);

  // The action returns null, so data is only defined after a finished submit
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data !== undefined) formRef.current?.reset();
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form method="post" ref={formRef}>
      <input type="hidden" name="intent" value={intent} />
      {storeId !== undefined && <input type="hidden" name="storeId" value={storeId} />}
      <Group align="flex-end">
        <TextInput name="name" placeholder={placeholder} size={size} style={{ flex: 1 }} />
        <Button type="submit" variant="light" size={size} leftSection={<IconPlus size={14} />}>Add</Button>
      </Group>
    </fetcher.Form>
  );
}

// Button listing the recipes an item is used in
function UsedInRecipes({ name, recipes }: { name: string; recipes: { id: number; name: string; archived: boolean }[] }) {
  if (recipes.length === 0) {
    return (
      <ActionIcon variant="subtle" color="gray" disabled aria-label={`${name} isn't used in any recipe`}>
        <IconToolsKitchen2 size={16} />
      </ActionIcon>
    );
  }

  return (
    <Popover position="bottom-end" shadow="md" withArrow>
      <Popover.Target>
        <ActionIcon variant="subtle" color="gray" aria-label={`Recipes using ${name}`}>
          <IconToolsKitchen2 size={16} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Text size="xs" fw={600} c="dimmed" mb={4}>Used in</Text>
        <Stack gap={4}>
          {recipes.map((r) => (
            <Group key={r.id} gap={6} wrap="nowrap">
              <Anchor component={Link} to={`/recipes/${r.id}`} size="sm">{r.name}</Anchor>
              {r.archived && <Badge size="xs" variant="outline" color="gray">archived</Badge>}
            </Group>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

type ItemRowData = Route.ComponentProps["loaderData"]["allItems"][number];
type UsedIn = Route.ComponentProps["loaderData"]["recipesByItem"][number];

// An item with its unit, optionally its shelf and store, and its buttons
function ItemRow({ item, usedIn, showPlace }: { item: ItemRowData; usedIn: UsedIn; showPlace: boolean }) {
  return (
    <Table.Tr>
      <Table.Td pl={item.isVariant ? "xl" : undefined}>
        {item.name}
        {item.alwaysAvailable && (
          <Badge size="xs" variant="outline" color="gray" ml={6}>always available</Badge>
        )}
      </Table.Td>
      <Table.Td c="dimmed">{item.defaultUnit ? unitName(item.defaultUnit) : "—"}</Table.Td>
      {showPlace && (
        <>
          <Table.Td c="dimmed">{item.shelfName ?? "—"}</Table.Td>
          <Table.Td c="dimmed">{item.storeName ?? "—"}</Table.Td>
        </>
      )}
      <Table.Td style={{ width: 104 }}>
        <Group gap={4} wrap="nowrap">
          <UsedInRecipes name={item.name} recipes={usedIn} />
          <ActionIcon component={Link} to={`/items/${item.id}`} variant="subtle">
            <IconPencil size={16} />
          </ActionIcon>
          {usedIn.length > 0 ? (
            // Disabled buttons don't fire hover events, so the tooltip sits on a wrapper
            <Tooltip label="Used in recipes; remove it from them first">
              <span>
                <ActionIcon variant="subtle" color="red" disabled aria-label={`Can't delete ${item.name}: used in recipes`}>
                  <IconTrash size={16} />
                </ActionIcon>
              </span>
            </Tooltip>
          ) : (
            <Form method="post">
              <input type="hidden" name="intent" value="delete-item" />
              <input type="hidden" name="id" value={item.id} />
              <ActionIcon type="submit" variant="subtle" color="red" aria-label={`Delete ${item.name}`}>
                <IconTrash size={16} />
              </ActionIcon>
            </Form>
          )}
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

export default function Items({ loaderData }: Route.ComponentProps) {
  const { allItems, allShelves, allStores, recipesByItem } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const byShelf = searchParams.get("by") === "shelf";

  return (
    <Container size="sm" py="xl">
      <Group justify="space-between" mb="md">
        <Title>Items</Title>
        <Button component={Link} to="/items/new" leftSection={<IconPlus size={16} />}>
          New
        </Button>
      </Group>

      <SegmentedControl
        mb="md"
        size="xs"
        data={[{ label: "By name", value: "name" }, { label: "By shelf", value: "shelf" }]}
        value={byShelf ? "shelf" : "name"}
        onChange={(by) => setSearchParams(by === "shelf" ? { by } : {}, { replace: true })}
      />

      {byShelf ? (
        [...groupByStoreAndShelf(allItems).entries()].map(([storeName, shelves]) => (
          <Stack key={storeName} mb="lg" gap="xs">
            <Text fw={600} size="sm" c="dimmed">{storeName}</Text>
            <Table highlightOnHover>
              <Table.Tbody>
                {[...shelves.entries()].flatMap(([shelfName, shelfItems]) => [
                  // No heading when nothing in this store has a shelf
                  ...(shelfName != null || shelves.size > 1
                    ? [
                        <Table.Tr key={`shelf-${shelfName ?? ""}`}>
                          <Table.Td colSpan={3} pt="md" pb={4}>
                            <Text size="xs" fw={600} tt="uppercase" c="dimmed">{shelfName ?? "Other"}</Text>
                          </Table.Td>
                        </Table.Tr>,
                      ]
                    : []),
                  ...shelfItems.map((item) => (
                    <ItemRow key={item.id} item={item} usedIn={recipesByItem[item.id] ?? []} showPlace={false} />
                  )),
                ])}
              </Table.Tbody>
            </Table>
          </Stack>
        ))
      ) : (
        <Table highlightOnHover mb="xl">
          <Table.Tbody>
            {allItems.map((item) => (
              <ItemRow key={item.id} item={item} usedIn={recipesByItem[item.id] ?? []} showPlace />
            ))}
          </Table.Tbody>
        </Table>
      )}
      {allItems.length === 0 && <Text c="dimmed" mb="xl">No items yet.</Text>}

      <Divider mb="lg" />

      <Title order={4} mb="sm">Stores and shelves</Title>
      <Text size="sm" c="dimmed" mb="md">
        Put each store's shelves in the order you walk past them; the shopping list follows it.
      </Text>
      <Stack gap="md" mb="md">
        {allStores.map((store) => {
          const shelves = allShelves.filter((s) => s.storeId === store.id);
          return (
            <Card key={store.id} withBorder radius="md" p="md">
              <Group justify="space-between" mb="xs">
                <RenamableName intent="rename-store" id={store.id} name={store.name} fw={600} />
                <Form method="post">
                  <input type="hidden" name="intent" value="delete-store" />
                  <input type="hidden" name="id" value={store.id} />
                  <ActionIcon type="submit" variant="subtle" color="red" size="sm" aria-label={`Delete ${store.name}`}>
                    <IconTrash size={14} />
                  </ActionIcon>
                </Form>
              </Group>
              <Stack gap={4} mb="sm">
                {shelves.map((shelf, i) => (
                  <Group key={shelf.id} justify="space-between" wrap="nowrap">
                    <RenamableName intent="rename-shelf" id={shelf.id} name={shelf.name} size="sm" />
                    <Group gap={0} wrap="nowrap">
                      <MoveButtons intent="move-shelf" fields={{ id: shelf.id }} first={i === 0} last={i === shelves.length - 1} />
                      <Form method="post">
                        <input type="hidden" name="intent" value="delete-shelf" />
                        <input type="hidden" name="id" value={shelf.id} />
                        <ActionIcon type="submit" variant="subtle" color="red" size="sm" aria-label={`Delete ${shelf.name}`}>
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Form>
                    </Group>
                  </Group>
                ))}
                {shelves.length === 0 && <Text size="sm" c="dimmed">No shelves yet.</Text>}
              </Stack>
              <AddNameForm intent="add-shelf" storeId={store.id} placeholder="New shelf…" size="xs" />
            </Card>
          );
        })}
        {allStores.length === 0 && <Text size="sm" c="dimmed">No stores yet.</Text>}
      </Stack>
      <AddNameForm intent="add-store" placeholder="New store…" />
    </Container>
  );
}
