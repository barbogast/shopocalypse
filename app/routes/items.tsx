import {
  ActionIcon,
  Button,
  Container,
  Divider,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { eq } from "drizzle-orm";
import { Form, Link } from "react-router";
import { db } from "~/db/client";
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
      categoryName: itemCategories.name,
      storeName: stores.name,
    })
    .from(items)
    .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
    .leftJoin(stores, eq(items.storeId, stores.id))
    .orderBy(items.name);

  const allCategories = await db.select().from(itemCategories).orderBy(itemCategories.name);
  const allStores = await db.select().from(stores).orderBy(stores.name);

  return { allItems, allCategories, allStores };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "delete-item") {
    await db.delete(items).where(eq(items.id, Number(form.get("id"))));
  }

  if (intent === "add-category") {
    const name = String(form.get("name")).trim();
    if (name) await db.insert(itemCategories).values({ name });
  }

  if (intent === "delete-category") {
    await db.delete(itemCategories).where(eq(itemCategories.id, Number(form.get("id"))));
  }

  if (intent === "add-store") {
    const name = String(form.get("name")).trim();
    if (name) await db.insert(stores).values({ name });
  }

  if (intent === "delete-store") {
    await db.delete(stores).where(eq(stores.id, Number(form.get("id"))));
  }

  return null;
}

export default function Items({ loaderData }: Route.ComponentProps) {
  const { allItems, allCategories, allStores } = loaderData;

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
              <Table.Td c="dimmed">{item.categoryName ?? "—"}</Table.Td>
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

      <Stack gap="xl">
        <div>
          <Title order={4} mb="sm">Categories</Title>
          <Stack gap="xs" mb="sm">
            {allCategories.map((cat) => (
              <Group key={cat.id} justify="space-between">
                <Text size="sm">{cat.name}</Text>
                <Form method="post">
                  <input type="hidden" name="intent" value="delete-category" />
                  <input type="hidden" name="id" value={cat.id} />
                  <ActionIcon type="submit" variant="subtle" color="red" size="sm">
                    <IconTrash size={14} />
                  </ActionIcon>
                </Form>
              </Group>
            ))}
            {allCategories.length === 0 && <Text size="sm" c="dimmed">None yet.</Text>}
          </Stack>
          <Form method="post">
            <input type="hidden" name="intent" value="add-category" />
            <Group align="flex-end">
              <TextInput name="name" placeholder="New category…" style={{ flex: 1 }} />
              <Button type="submit" variant="light" leftSection={<IconPlus size={14} />}>Add</Button>
            </Group>
          </Form>
        </div>

        <div>
          <Title order={4} mb="sm">Stores</Title>
          <Stack gap="xs" mb="sm">
            {allStores.map((store) => (
              <Group key={store.id} justify="space-between">
                <Text size="sm">{store.name}</Text>
                <Form method="post">
                  <input type="hidden" name="intent" value="delete-store" />
                  <input type="hidden" name="id" value={store.id} />
                  <ActionIcon type="submit" variant="subtle" color="red" size="sm">
                    <IconTrash size={14} />
                  </ActionIcon>
                </Form>
              </Group>
            ))}
            {allStores.length === 0 && <Text size="sm" c="dimmed">None yet.</Text>}
          </Stack>
          <Form method="post">
            <input type="hidden" name="intent" value="add-store" />
            <Group align="flex-end">
              <TextInput name="name" placeholder="New store…" style={{ flex: 1 }} />
              <Button type="submit" variant="light" leftSection={<IconPlus size={14} />}>Add</Button>
            </Group>
          </Form>
        </div>
      </Stack>
    </Container>
  );
}
