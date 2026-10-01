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
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconPencil, IconPlus, IconToolsKitchen2, IconTrash, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { eq } from "drizzle-orm";
import { Form, Link } from "react-router";
import { MoveButtons } from "~/components/move-buttons";
import { db } from "~/db/client";
import { addShelf, deleteItem, deleteShelf, deleteStore, listShelves, moveShelf } from "~/db/items.server";
import { itemCategories, items, recipeIngredients, recipes, stores } from "~/db/schema";
import { int, text } from "~/forms";
import { unitName } from "~/units";
import type { Route } from "./+types/items";

export function meta() {
  return [{ title: "Items – Shopocalypse" }];
}

export async function loader() {
  const allItems = await db
    .select({
      id: items.id,
      name: items.name,
      defaultUnit: items.defaultUnit,
      alwaysAvailable: items.alwaysAvailable,
      shelfName: itemCategories.name,
      storeName: stores.name,
    })
    .from(items)
    .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
    .leftJoin(stores, eq(items.storeId, stores.id))
    .orderBy(items.name);

  const allShelves = listShelves();
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

  if (intent === "delete-item") {
    if (id) deleteItem(id);
  }

  if (intent === "add-shelf") {
    const storeId = int(form, "storeId");
    if (storeId && name) addShelf(storeId, name);
  }

  if (intent === "rename-shelf") {
    if (id && name) await db.update(itemCategories).set({ name }).where(eq(itemCategories.id, id));
  }

  if (intent === "move-shelf") {
    if (id) moveShelf(id, form.get("direction") === "up");
  }

  if (intent === "delete-shelf") {
    if (id) deleteShelf(id);
  }

  if (intent === "add-store") {
    if (name) await db.insert(stores).values({ name });
  }

  if (intent === "rename-store") {
    if (id && name) await db.update(stores).set({ name }).where(eq(stores.id, id));
  }

  if (intent === "delete-store") {
    if (id) deleteStore(id);
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

export default function Items({ loaderData }: Route.ComponentProps) {
  const { allItems, allShelves, allStores, recipesByItem } = loaderData;

  return (
    <Container size="sm" py="xl">
      <Group justify="space-between" mb="lg">
        <Title>Items</Title>
        <Button component={Link} to="/items/new" leftSection={<IconPlus size={16} />}>
          New
        </Button>
      </Group>

      <Table highlightOnHover mb="xl">
        <Table.Tbody>
          {allItems.map((item) => (
            <Table.Tr key={item.id}>
              <Table.Td>
                {item.name}
                {item.alwaysAvailable && (
                  <Badge size="xs" variant="outline" color="gray" ml={6}>always available</Badge>
                )}
              </Table.Td>
              <Table.Td c="dimmed">{item.defaultUnit ? unitName(item.defaultUnit) : "—"}</Table.Td>
              <Table.Td c="dimmed">{item.shelfName ?? "—"}</Table.Td>
              <Table.Td c="dimmed">{item.storeName ?? "—"}</Table.Td>
              <Table.Td style={{ width: 104 }}>
                <Group gap={4} wrap="nowrap">
                  <UsedInRecipes name={item.name} recipes={recipesByItem[item.id] ?? []} />
                  <ActionIcon component={Link} to={`/items/${item.id}`} variant="subtle">
                    <IconPencil size={16} />
                  </ActionIcon>
                  {recipesByItem[item.id] ? (
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
          ))}
          {allItems.length === 0 && (
            <Table.Tr>
              <Table.Td c="dimmed">No items yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

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
              <Form method="post">
                <input type="hidden" name="intent" value="add-shelf" />
                <input type="hidden" name="storeId" value={store.id} />
                <Group align="flex-end">
                  <TextInput name="name" placeholder="New shelf…" size="xs" style={{ flex: 1 }} />
                  <Button type="submit" variant="light" size="xs" leftSection={<IconPlus size={14} />}>Add</Button>
                </Group>
              </Form>
            </Card>
          );
        })}
        {allStores.length === 0 && <Text size="sm" c="dimmed">No stores yet.</Text>}
      </Stack>
      <Form method="post">
        <input type="hidden" name="intent" value="add-store" />
        <Group align="flex-end">
          <TextInput name="name" placeholder="New store…" style={{ flex: 1 }} />
          <Button type="submit" variant="light" leftSection={<IconPlus size={14} />}>Add</Button>
        </Group>
      </Form>
    </Container>
  );
}
