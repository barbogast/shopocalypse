import {
  Badge,
  Button,
  Container,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Title,
} from "@mantine/core";
import { eq } from "drizzle-orm";
import { Form, redirect } from "react-router";
import { STOCK_TRACKING_ENABLED } from "~/config";
import { db } from "~/db/client";
import { items, stock } from "~/db/schema";
import type { Route } from "./+types/stock";

export function meta() {
  return [{ title: "Stock – Shopocalypse" }];
}

export async function loader() {
  if (!STOCK_TRACKING_ENABLED) throw redirect("/shopping");
  const tracked = await db
    .select({
      itemId: stock.itemId,
      name: items.name,
      currentQuantity: stock.currentQuantity,
      desiredQuantity: stock.desiredQuantity,
    })
    .from(stock)
    .innerJoin(items, eq(stock.itemId, items.id))
    .orderBy(items.name);

  const trackedIds = new Set(tracked.map((s) => s.itemId));
  const untracked = await db
    .select({ id: items.id, name: items.name })
    .from(items)
    .orderBy(items.name)
    .then((all) => all.filter((i) => !trackedIds.has(i.id)));

  return { tracked, untracked };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "update") {
    const itemId = Number(form.get("itemId"));
    const currentQuantity = Number(form.get("currentQuantity"));
    const desiredQuantity = Number(form.get("desiredQuantity"));
    await db
      .update(stock)
      .set({ currentQuantity, desiredQuantity })
      .where(eq(stock.itemId, itemId));
  }

  if (intent === "add") {
    const itemId = Number(form.get("itemId"));
    await db
      .insert(stock)
      .values({ itemId, currentQuantity: 0, desiredQuantity: 0 })
      .onConflictDoNothing();
  }

  if (intent === "remove") {
    const itemId = Number(form.get("itemId"));
    await db.delete(stock).where(eq(stock.itemId, itemId));
  }

  return null;
}

export default function Stock({ loaderData }: Route.ComponentProps) {
  const { tracked, untracked } = loaderData;

  return (
    <Container size="sm" py="xl">
      <Title mb="lg">Stock</Title>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Item</Table.Th>
            <Table.Th style={{ width: 90 }}>Current</Table.Th>
            <Table.Th style={{ width: 90 }}>Desired</Table.Th>
            <Table.Th style={{ width: 80 }} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tracked.map((row) => {
            const low = row.currentQuantity < row.desiredQuantity;
            return (
              <Table.Tr key={row.itemId}>
                <Table.Td>
                  <Group gap="xs">
                    {row.name}
                    {low && <Badge color="orange" variant="light" size="xs">Low</Badge>}
                  </Group>
                </Table.Td>
                <Table.Td colSpan={3}>
                  <Form method="post" style={{ display: "contents" }}>
                    <input type="hidden" name="intent" value="update" />
                    <input type="hidden" name="itemId" value={row.itemId} />
                    <Group gap="xs" wrap="nowrap">
                      <NumberInput
                        name="currentQuantity"
                        defaultValue={row.currentQuantity}
                        min={0}
                        style={{ width: 80 }}
                        aria-label="Current quantity"
                      />
                      <NumberInput
                        name="desiredQuantity"
                        defaultValue={row.desiredQuantity}
                        min={0}
                        style={{ width: 80 }}
                        aria-label="Desired quantity"
                      />
                      <Button type="submit" size="xs" variant="light">Save</Button>
                      <Form method="post">
                        <input type="hidden" name="intent" value="remove" />
                        <input type="hidden" name="itemId" value={row.itemId} />
                        <Button type="submit" size="xs" variant="subtle" color="red">✕</Button>
                      </Form>
                    </Group>
                  </Form>
                </Table.Td>
              </Table.Tr>
            );
          })}
          {tracked.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={4} c="dimmed">No items tracked yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      {untracked.length > 0 && (
        <Stack mt="xl">
          <Title order={4}>Track an item</Title>
          <Form method="post">
            <input type="hidden" name="intent" value="add" />
            <Group align="flex-end">
              <Select
                name="itemId"
                data={untracked.map((i) => ({ value: String(i.id), label: i.name }))}
                searchable
                placeholder="Select item…"
                style={{ flex: 1 }}
              />
              <Button type="submit">Add</Button>
            </Group>
          </Form>
        </Stack>
      )}
    </Container>
  );
}
