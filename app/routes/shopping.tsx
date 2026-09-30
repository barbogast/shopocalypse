import {
  Badge,
  Button,
  Checkbox,
  Container,
  Divider,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconCheck, IconPlus, IconShoppingCart, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { asc, eq, inArray, lt, sql } from "drizzle-orm";
import { Form } from "react-router";
import { STOCK_TRACKING_ENABLED } from "~/config";
import { db } from "~/db/client";
import {
  itemCategories,
  items,
  mealSchedule,
  recipeIngredients,
  recipes,
  shoppingListItems,
  shoppingListRecipes,
  shoppingLists,
  stock,
  stores,
} from "~/db/schema";
import type { Route } from "./+types/shopping";

export function meta() {
  return [{ title: "Shopping – Shopocalypse" }];
}

// Collapse repeated recipes into one entry with a count, keeping first-seen order
function countNames(rows: { name: string }[]) {
  const counts = new Map<string, number>();
  for (const { name } of rows) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count }));
}

export async function loader() {
  const [activeList] = await db
    .select()
    .from(shoppingLists)
    .where(eq(shoppingLists.status, "active"))
    .limit(1);

  const scheduled = await db
    .select({ position: mealSchedule.position, name: recipes.name })
    .from(mealSchedule)
    .innerJoin(recipes, eq(mealSchedule.recipeId, recipes.id))
    .orderBy(asc(mealSchedule.position));

  if (!activeList) {
    const allItems = await db.select({ id: items.id, name: items.name }).from(items).orderBy(items.name);
    return { activeList: null, listItems: [], scheduled, allItems };
  }

  const listItems = await db
    .select({
      id: shoppingListItems.id,
      itemId: shoppingListItems.itemId,
      itemName: items.name,
      quantityNeeded: shoppingListItems.quantityNeeded,
      quantityBought: shoppingListItems.quantityBought,
      source: shoppingListItems.source,
      storeName: stores.name,
      categoryName: itemCategories.name,
    })
    .from(shoppingListItems)
    .innerJoin(items, eq(shoppingListItems.itemId, items.id))
    .leftJoin(stores, eq(items.storeId, stores.id))
    .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
    .where(eq(shoppingListItems.shoppingListId, activeList.id))
    .orderBy(stores.name, itemCategories.name, items.name);

  const listedItemIds = new Set(listItems.map((i) => i.itemId));
  const allItems = await db
    .select({ id: items.id, name: items.name })
    .from(items)
    .orderBy(items.name)
    .then((all) => all.filter((i) => !listedItemIds.has(i.id)));

  const listRecipes = await db
    .select({ name: recipes.name })
    .from(shoppingListRecipes)
    .innerJoin(recipes, eq(shoppingListRecipes.recipeId, recipes.id))
    .where(eq(shoppingListRecipes.shoppingListId, activeList.id))
    .orderBy(asc(shoppingListRecipes.id));

  // Formatted on the server so client and server render the same string
  const createdAt = new Date(activeList.createdAt).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return { activeList, createdAt, listRecipes: countNames(listRecipes), listItems, scheduled, allItems };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "prepare") {
    const positions = form.getAll("position").map(Number);

    const scheduled =
      positions.length > 0
        ? await db
            .select()
            .from(mealSchedule)
            .where(inArray(mealSchedule.position, positions))
            .orderBy(asc(mealSchedule.position))
        : [];

    // Sum ingredients across selected meals
    const mealTotals = new Map<number, number>();
    for (const meal of scheduled) {
      const ings = await db
        .select()
        .from(recipeIngredients)
        .where(eq(recipeIngredients.recipeId, meal.recipeId));
      for (const ing of ings) {
        mealTotals.set(ing.itemId, (mealTotals.get(ing.itemId) ?? 0) + ing.quantity);
      }
    }

    // Subtract stock
    const stockRows = STOCK_TRACKING_ENABLED ? await db.select().from(stock) : [];
    const stockMap = new Map(stockRows.map((s) => [s.itemId, s.currentQuantity]));

    const toAdd = new Map<number, { quantity: number; source: "meal_plan" | "stock_deficit" }>();
    for (const [itemId, qty] of mealTotals) {
      const needed = qty - (stockMap.get(itemId) ?? 0);
      if (needed > 0) toAdd.set(itemId, { quantity: needed, source: "meal_plan" });
    }

    // Add stock deficits not already covered
    const deficits = STOCK_TRACKING_ENABLED
      ? await db
          .select()
          .from(stock)
          .where(lt(stock.currentQuantity, stock.desiredQuantity))
      : [];
    for (const deficit of deficits) {
      if (!toAdd.has(deficit.itemId)) {
        toAdd.set(deficit.itemId, {
          quantity: deficit.desiredQuantity - deficit.currentQuantity,
          source: "stock_deficit",
        });
      }
    }

    const [list] = await db
      .insert(shoppingLists)
      .values({ createdAt: new Date().toISOString(), status: "active" })
      .returning();

    if (scheduled.length > 0) {
      await db
        .insert(shoppingListRecipes)
        .values(scheduled.map((meal) => ({ shoppingListId: list.id, recipeId: meal.recipeId })));
    }

    if (toAdd.size > 0) {
      await db.insert(shoppingListItems).values(
        [...toAdd.entries()].map(([itemId, { quantity, source }]) => ({
          shoppingListId: list.id,
          itemId,
          quantityNeeded: quantity,
          source,
        }))
      );
    }
  }

  if (intent === "add-manual") {
    const [activeList] = await db
      .select()
      .from(shoppingLists)
      .where(eq(shoppingLists.status, "active"))
      .limit(1);
    if (!activeList) return null;

    const itemId = Number(form.get("itemId"));
    const quantity = Number(form.get("quantity"));
    await db
      .insert(shoppingListItems)
      .values({ shoppingListId: activeList.id, itemId, quantityNeeded: quantity, source: "manual" })
      .onConflictDoNothing();
  }

  if (intent === "tick") {
    const id = Number(form.get("id"));
    const quantityBought = Number(form.get("quantityBought"));
    await db
      .update(shoppingListItems)
      .set({ quantityBought })
      .where(eq(shoppingListItems.id, id));
  }

  if (intent === "untick") {
    const id = Number(form.get("id"));
    await db
      .update(shoppingListItems)
      .set({ quantityBought: null })
      .where(eq(shoppingListItems.id, id));
  }

  if (intent === "remove-item") {
    const id = Number(form.get("id"));
    await db.delete(shoppingListItems).where(eq(shoppingListItems.id, id));
  }

  if (intent === "finish") {
    const [activeList] = await db
      .select()
      .from(shoppingLists)
      .where(eq(shoppingLists.status, "active"))
      .limit(1);
    if (!activeList) return null;

    const ticked = await db
      .select()
      .from(shoppingListItems)
      .where(eq(shoppingListItems.shoppingListId, activeList.id))
      .then((rows) => rows.filter((r) => r.quantityBought != null));

    await db.transaction(async (tx) => {
      for (const item of STOCK_TRACKING_ENABLED ? ticked : []) {
        const bought = item.quantityBought!;
        const [existing] = await tx
          .select()
          .from(stock)
          .where(eq(stock.itemId, item.itemId));
        if (existing) {
          await tx
            .update(stock)
            .set({ currentQuantity: existing.currentQuantity + bought })
            .where(eq(stock.itemId, item.itemId));
        } else {
          await tx.insert(stock).values({
            itemId: item.itemId,
            currentQuantity: bought,
            desiredQuantity: 0,
          });
        }
      }
      await tx
        .update(shoppingLists)
        .set({ status: "completed" })
        .where(eq(shoppingLists.id, activeList.id));
    });
  }

  if (intent === "discard") {
    const [activeList] = await db
      .select()
      .from(shoppingLists)
      .where(eq(shoppingLists.status, "active"))
      .limit(1);
    if (!activeList) return null;
    await db.delete(shoppingListItems).where(eq(shoppingListItems.shoppingListId, activeList.id));
    await db.delete(shoppingListRecipes).where(eq(shoppingListRecipes.shoppingListId, activeList.id));
    await db.delete(shoppingLists).where(eq(shoppingLists.id, activeList.id));
  }

  return null;
}

// Group list items by store
function groupByStore<T extends { storeName: string | null }>(listItems: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of listItems) {
    const key = item.storeName ?? "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return groups;
}

function PrepareList({ scheduled }: { scheduled: { position: number; name: string }[] }) {
  const [selected, setSelected] = useState(() => new Set(scheduled.map((m) => m.position)));
  const toggle = (position: number, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(position);
      else next.delete(position);
      return next;
    });

  return (
    <Container size="sm" py="xl">
      <Title mb="lg">Shopping</Title>
      <Text c="dimmed" mb="xl">No active shopping list.</Text>
      <Form method="post">
        <input type="hidden" name="intent" value="prepare" />
        <Stack maw={300}>
          <Text size="sm" fw={500}>Meals to shop for</Text>
          {scheduled.length > 0 ? (
            <Stack gap="xs">
              {scheduled.map((meal) => (
                <Checkbox
                  key={meal.position}
                  name="position"
                  value={meal.position}
                  label={meal.name}
                  checked={selected.has(meal.position)}
                  onChange={(e) => toggle(meal.position, e.currentTarget.checked)}
                />
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">No meals scheduled.</Text>
          )}
          <Button type="submit" leftSection={<IconShoppingCart size={16} />}>
            {selected.size > 0 ? "Prepare list" : "Start empty list"}
          </Button>
        </Stack>
      </Form>
    </Container>
  );
}

export default function Shopping({ loaderData }: Route.ComponentProps) {
  if (!loaderData.activeList) return <PrepareList scheduled={loaderData.scheduled} />;
  const { createdAt, listRecipes, listItems, allItems } = loaderData;

  const groups = groupByStore(listItems);
  const allTicked = listItems.length > 0 && listItems.every((i) => i.quantityBought != null);
  const tickedCount = listItems.filter((i) => i.quantityBought != null).length;

  return (
    <Container size="sm" py="xl">
      <Group justify="space-between" mb="xs">
        <Title>Shopping</Title>
        <Text c="dimmed" size="sm">{tickedCount}/{listItems.length}</Text>
      </Group>
      <Text c="dimmed" size="sm">Created {createdAt}</Text>
      <Text c="dimmed" size="sm" mb="lg">
        {listRecipes.length > 0
          ? `For: ${listRecipes.map((r) => (r.count > 1 ? `${r.name} ×${r.count}` : r.name)).join(", ")}`
          : "No meals"}
      </Text>

      {listItems.length === 0 && (
        <Text c="dimmed" mb="lg">No items on the list.</Text>
      )}

      {[...groups.entries()].map(([storeName, storeItems]) => (
        <Stack key={storeName} mb="lg" gap="xs">
          <Text fw={600} size="sm" c="dimmed">{storeName}</Text>
          <Table>
            <Table.Tbody>
              {storeItems.map((item) => {
                const ticked = item.quantityBought != null;
                return (
                  <Table.Tr key={item.id} opacity={ticked ? 0.5 : 1}>
                    <Table.Td>
                      <Text td={ticked ? "line-through" : undefined}>{item.itemName}</Text>
                      {item.source === "stock_deficit" && (
                        <Badge size="xs" variant="outline" color="gray">stock</Badge>
                      )}
                      {item.source === "manual" && (
                        <Badge size="xs" variant="outline" color="gray">manual</Badge>
                      )}
                    </Table.Td>
                    <Table.Td style={{ width: 40 }} c="dimmed">
                      {ticked ? item.quantityBought : item.quantityNeeded}×
                    </Table.Td>
                    <Table.Td style={{ width: 120 }}>
                      {!ticked ? (
                        <Form method="post" style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input type="hidden" name="intent" value="tick" />
                          <input type="hidden" name="id" value={item.id} />
                          <NumberInput
                            name="quantityBought"
                            defaultValue={item.quantityNeeded}
                            min={0}
                            style={{ width: 70 }}
                            size="xs"
                          />
                          <Button type="submit" size="xs" color="green" px={6}>
                            <IconCheck size={14} />
                          </Button>
                        </Form>
                      ) : (
                        <Form method="post">
                          <input type="hidden" name="intent" value="untick" />
                          <input type="hidden" name="id" value={item.id} />
                          <Button type="submit" size="xs" variant="subtle">Undo</Button>
                        </Form>
                      )}
                    </Table.Td>
                    <Table.Td style={{ width: 32 }}>
                      <Form method="post">
                        <input type="hidden" name="intent" value="remove-item" />
                        <input type="hidden" name="id" value={item.id} />
                        <Button type="submit" size="xs" variant="subtle" color="red" px={4}>
                          <IconTrash size={12} />
                        </Button>
                      </Form>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Stack>
      ))}

      {allItems.length > 0 && (
        <>
          <Divider my="md" />
          <Form method="post">
            <input type="hidden" name="intent" value="add-manual" />
            <Group align="flex-end">
              <Select
                name="itemId"
                label="Add item"
                data={allItems.map((i) => ({ value: String(i.id), label: i.name }))}
                searchable
                placeholder="Select item…"
                style={{ flex: 1 }}
              />
              <NumberInput name="quantity" label="Qty" min={1} defaultValue={1} style={{ width: 80 }} />
              <Button type="submit" leftSection={<IconPlus size={16} />}>Add</Button>
            </Group>
          </Form>
        </>
      )}

      <Divider my="lg" />
      <Group>
        <Form method="post">
          <input type="hidden" name="intent" value="finish" />
          <Button type="submit" color="green" disabled={tickedCount === 0}>
            Finish shopping
          </Button>
        </Form>
        <Form method="post">
          <input type="hidden" name="intent" value="discard" />
          <Button type="submit" variant="subtle" color="red">Discard list</Button>
        </Form>
      </Group>
    </Container>
  );
}
