import {
  ActionIcon,
  Button,
  Card,
  Container,
  Divider,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconCheck, IconChevronDown, IconChevronUp, IconPencil, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { eq } from "drizzle-orm";
import { Form, Link } from "react-router";
import { db } from "~/db/client";
import { addShelf, deleteShelf, deleteStore, listShelves, moveShelf } from "~/db/items.server";
import { itemCategories, items, stores } from "~/db/schema";
import type { Route } from "./+types/items";

export function meta() {
  return [{ title: "Items – Shopocalypse" }];
}

export async function loader() {
  const allItems = await db
    .select({
      id: items.id,
      name: items.name,
      shelfName: itemCategories.name,
      storeName: stores.name,
    })
    .from(items)
    .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
    .leftJoin(stores, eq(items.storeId, stores.id))
    .orderBy(items.name);

  const allShelves = listShelves();
  const allStores = await db.select().from(stores).orderBy(stores.name);

  return { allItems, allShelves, allStores };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "delete-item") {
    await db.delete(items).where(eq(items.id, Number(form.get("id"))));
  }

  if (intent === "add-shelf") {
    const name = String(form.get("name")).trim();
    if (name) addShelf(Number(form.get("storeId")), name);
  }

  if (intent === "rename-shelf") {
    const name = String(form.get("name")).trim();
    if (name) await db.update(itemCategories).set({ name }).where(eq(itemCategories.id, Number(form.get("id"))));
  }

  if (intent === "move-shelf") {
    moveShelf(Number(form.get("id")), form.get("direction") === "up");
  }

  if (intent === "delete-shelf") {
    deleteShelf(Number(form.get("id")));
  }

  if (intent === "add-store") {
    const name = String(form.get("name")).trim();
    if (name) await db.insert(stores).values({ name });
  }

  if (intent === "rename-store") {
    const name = String(form.get("name")).trim();
    if (name) await db.update(stores).set({ name }).where(eq(stores.id, Number(form.get("id"))));
  }

  if (intent === "delete-store") {
    deleteStore(Number(form.get("id")));
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

function ShelfMoveButtons({ id, first, last }: { id: number; first: boolean; last: boolean }) {
  return (
    <Form method="post" style={{ display: "flex" }}>
      <input type="hidden" name="intent" value="move-shelf" />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" name="direction" value="up" disabled={first}
        variant="subtle" color="gray" size="xs" px={6} aria-label="Move up">
        <IconChevronUp size={14} />
      </Button>
      <Button type="submit" name="direction" value="down" disabled={last}
        variant="subtle" color="gray" size="xs" px={6} aria-label="Move down">
        <IconChevronDown size={14} />
      </Button>
    </Form>
  );
}

export default function Items({ loaderData }: Route.ComponentProps) {
  const { allItems, allShelves, allStores } = loaderData;

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
              <Table.Td>{item.name}</Table.Td>
              <Table.Td c="dimmed">{item.shelfName ?? "—"}</Table.Td>
              <Table.Td c="dimmed">{item.storeName ?? "—"}</Table.Td>
              <Table.Td style={{ width: 72 }}>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon component={Link} to={`/items/${item.id}`} variant="subtle">
                    <IconPencil size={16} />
                  </ActionIcon>
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete-item" />
                    <input type="hidden" name="id" value={item.id} />
                    <ActionIcon type="submit" variant="subtle" color="red">
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Form>
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
                      <ShelfMoveButtons id={shelf.id} first={i === 0} last={i === shelves.length - 1} />
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
