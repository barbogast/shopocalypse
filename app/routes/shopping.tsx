import {
  Badge,
  Button,
  Checkbox,
  Container,
  Anchor,
  Divider,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconCheck, IconPlus, IconShoppingCart, IconTrash, IconUsers } from "@tabler/icons-react";
import { useState } from "react";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Form } from "react-router";
import { RecipeDrawer } from "~/components/recipe-drawer";
import { db } from "~/db/client";
import { withIngredients } from "~/db/recipes.server";
import {
  itemCategories,
  items,
  mealSchedule,
  recipeIngredients,
  recipes,
  shoppingListItems,
  shoppingListRecipes,
  shoppingLists,
  stores,
} from "~/db/schema";
import {
  type Amount,
  combineAmounts,
  DEFAULT_UNIT,
  formatAmounts,
  parseAmount,
  roundUpToBuy,
  scaleAmount,
  UNIT_OPTIONS,
} from "~/units";
import type { Route } from "./+types/shopping";

export function meta() {
  return [{ title: "Shopping – Shopocalypse" }];
}

// Servings of a scheduled or listed meal, falling back to the recipe's serving size
function mealServings(servings: typeof mealSchedule.servings | typeof shoppingListRecipes.servings) {
  return sql<number>`coalesce(${servings}, ${recipes.servingSize})`;
}

// Compact servings marker, e.g. "👥 6"
function Servings({ servings }: { servings: number }) {
  return (
    <span style={{ whiteSpace: "nowrap" }} aria-label={`${servings} servings`}>
      {" "}
      <IconUsers size="1em" style={{ verticalAlign: "-0.125em" }} /> {servings}
    </span>
  );
}

// Collapse repeated meals (same recipe and servings) into one entry with a count, keeping first-seen order
function countRecipes<T extends { id: number; servings: number }>(rows: T[]) {
  const counts = new Map<string, T & { key: string; count: number }>();
  for (const row of rows) {
    const key = `${row.id}-${row.servings}`;
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { ...row, key, count: 1 });
  }
  return [...counts.values()];
}

export async function loader() {
  const [activeList] = await db
    .select()
    .from(shoppingLists)
    .where(eq(shoppingLists.status, "active"))
    .limit(1);

  const scheduled = await db
    .select({
      position: mealSchedule.position,
      name: recipes.name,
      servings: mealServings(mealSchedule.servings),
      servingSize: recipes.servingSize,
    })
    .from(mealSchedule)
    .innerJoin(recipes, eq(mealSchedule.recipeId, recipes.id))
    .orderBy(asc(mealSchedule.position));

  if (!activeList) {
    return { activeList: null, listItems: [], scheduled };
  }

  const listItems = await db
    .select({
      id: shoppingListItems.id,
      itemId: shoppingListItems.itemId,
      itemName: items.name,
      amounts: shoppingListItems.amounts,
      bought: shoppingListItems.bought,
      source: shoppingListItems.source,
      storeName: stores.name,
      shelfName: itemCategories.name,
    })
    .from(shoppingListItems)
    .innerJoin(items, eq(shoppingListItems.itemId, items.id))
    .leftJoin(stores, eq(items.storeId, stores.id))
    .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
    .where(eq(shoppingListItems.shoppingListId, activeList.id))
    // Stores alphabetically, then shelves in walking order; items without a store or shelf go last
    .orderBy(
      sql`${stores.name} is null`,
      stores.name,
      sql`${itemCategories.position} is null`,
      itemCategories.position,
      items.name,
    );

  const listedItemIds = new Set(listItems.map((i) => i.itemId));
  const allItems = await db
    .select({ id: items.id, name: items.name, defaultUnit: items.defaultUnit })
    .from(items)
    .orderBy(items.name)
    .then((all) => all.filter((i) => !listedItemIds.has(i.id)));

  const listRecipeRows = await db
    .select({
      id: recipes.id,
      name: recipes.name,
      servingSize: recipes.servingSize,
      servings: mealServings(shoppingListRecipes.servings),
      instructions: recipes.instructions,
      comments: recipes.comments,
    })
    .from(shoppingListRecipes)
    .innerJoin(recipes, eq(shoppingListRecipes.recipeId, recipes.id))
    .where(eq(shoppingListRecipes.shoppingListId, activeList.id))
    .orderBy(asc(shoppingListRecipes.id));

  const listRecipes = countRecipes(await withIngredients(listRecipeRows));

  // Formatted on the server so client and server render the same string
  const createdAt = new Date(activeList.createdAt).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return { activeList, createdAt, listRecipes, listItems, scheduled, allItems };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "prepare") {
    const positions = form.getAll("position").map(Number);
    const includeInStock = form.get("includeInStock") === "on";

    const scheduled =
      positions.length > 0
        ? await db
            .select({
              recipeId: mealSchedule.recipeId,
              servings: mealServings(mealSchedule.servings),
              servingSize: recipes.servingSize,
            })
            .from(mealSchedule)
            .innerJoin(recipes, eq(mealSchedule.recipeId, recipes.id))
            .where(inArray(mealSchedule.position, positions))
            .orderBy(asc(mealSchedule.position))
        : [];

    // Collect ingredient amounts across selected meals, per item
    const mealAmounts = new Map<number, Amount[]>();
    for (const meal of scheduled) {
      // Always-available items are assumed to be in stock unless asked for
      const ings = await db
        .select({ itemId: recipeIngredients.itemId, quantity: recipeIngredients.quantity, unit: recipeIngredients.unit })
        .from(recipeIngredients)
        .innerJoin(items, eq(recipeIngredients.itemId, items.id))
        .where(and(
          eq(recipeIngredients.recipeId, meal.recipeId),
          includeInStock ? undefined : eq(items.alwaysAvailable, false),
        ));
      for (const ing of ings) {
        const amount = scaleAmount(ing, meal.servings, meal.servingSize);
        mealAmounts.set(ing.itemId, [...(mealAmounts.get(ing.itemId) ?? []), amount]);
      }
    }

    // Stock tracking is deferred (no units yet), so nothing is subtracted
    const toAdd = new Map<number, Amount[]>();
    for (const [itemId, amounts] of mealAmounts) toAdd.set(itemId, roundUpToBuy(combineAmounts(amounts)));

    const [list] = await db
      .insert(shoppingLists)
      .values({ createdAt: new Date().toISOString(), status: "active" })
      .returning();

    if (scheduled.length > 0) {
      await db
        .insert(shoppingListRecipes)
        .values(scheduled.map((meal) => ({ shoppingListId: list.id, recipeId: meal.recipeId, servings: meal.servings })));
    }

    if (toAdd.size > 0) {
      await db.insert(shoppingListItems).values(
        [...toAdd.entries()].map(([itemId, amounts]) => ({
          shoppingListId: list.id,
          itemId,
          amounts,
          source: "meal_plan" as const,
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
    const parsed = parseAmount(form);
    if (!itemId || "error" in parsed) return null;
    await db
      .insert(shoppingListItems)
      .values({ shoppingListId: activeList.id, itemId, amounts: combineAmounts([parsed.amount]), source: "manual" })
      .onConflictDoNothing();
  }

  if (intent === "tick") {
    const id = Number(form.get("id"));
    await db
      .update(shoppingListItems)
      .set({ bought: true })
      .where(eq(shoppingListItems.id, id));
  }

  if (intent === "untick") {
    const id = Number(form.get("id"));
    await db
      .update(shoppingListItems)
      .set({ bought: false })
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

    // Stock tracking is deferred, so finishing doesn't add bought items to it
    await db
      .update(shoppingLists)
      .set({ status: "completed" })
      .where(eq(shoppingLists.id, activeList.id));
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

// Group list items by store, then by shelf (keeps the loader's order)
function groupByStoreAndShelf<T extends { storeName: string | null; shelfName: string | null }>(listItems: T[]) {
  const groups = new Map<string, Map<string | null, T[]>>();
  for (const item of listItems) {
    const storeKey = item.storeName ?? "Other";
    const shelfKey = item.shelfName;
    if (!groups.has(storeKey)) groups.set(storeKey, new Map());
    const shelves = groups.get(storeKey)!;
    if (!shelves.has(shelfKey)) shelves.set(shelfKey, []);
    shelves.get(shelfKey)!.push(item);
  }
  return groups;
}

function PrepareList({ scheduled }: { scheduled: { position: number; name: string; servings: number; servingSize: number }[] }) {
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
                  label={<>{meal.name}{meal.servings !== meal.servingSize && <Servings servings={meal.servings} />}</>}
                  checked={selected.has(meal.position)}
                  onChange={(e) => toggle(meal.position, e.currentTarget.checked)}
                />
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">No meals scheduled.</Text>
          )}
          <Checkbox
            name="includeInStock"
            label="Include items in stock"
            description="Also add items marked as always available"
            mt="xs"
          />
          <Button type="submit" leftSection={<IconShoppingCart size={16} />}>
            {selected.size > 0 ? "Prepare list" : "Start empty list"}
          </Button>
        </Stack>
      </Form>
    </Container>
  );
}

type ListRecipe = Extract<Awaited<ReturnType<typeof loader>>, { createdAt: string }>["listRecipes"][number];

// "For: …" line; tapping a recipe opens its details without leaving the list
function ListMeals({ recipes }: { recipes: ListRecipe[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = recipes.find((r) => r.key === openKey);

  if (recipes.length === 0) return <Text c="dimmed" size="sm" mb="lg">No meals</Text>;

  return (
    <>
      <Text c="dimmed" size="sm" mb="lg">
        For:{" "}
        {recipes.map((r, i) => (
          <span key={r.key}>
            {i > 0 && ", "}
            <Anchor component="button" type="button" size="sm" onClick={() => setOpenKey(r.key)}>
              {r.name}
            </Anchor>
            {r.servings !== r.servingSize && <Servings servings={r.servings} />}
            {r.count > 1 && ` ×${r.count}`}
          </span>
        ))}
      </Text>

      <RecipeDrawer
        recipe={open}
        note={open && open.count > 1 ? `on this list ×${open.count}` : undefined}
        onClose={() => setOpenKey(null)}
      />
    </>
  );
}

// Manually add an item; the unit starts on the item's default unit
function AddItemForm({ items }: { items: { id: number; name: string; defaultUnit: string | null }[] }) {
  const [unit, setUnit] = useState<string | null>(DEFAULT_UNIT);

  return (
    <Form method="post">
      <input type="hidden" name="intent" value="add-manual" />
      <Group align="flex-end" gap="xs">
        <Select
          name="itemId"
          label="Add item"
          data={items.map((i) => ({ value: String(i.id), label: i.name }))}
          searchable
          placeholder="Select item…"
          onChange={(value) => setUnit(items.find((i) => String(i.id) === value)?.defaultUnit ?? DEFAULT_UNIT)}
          style={{ flex: 1, minWidth: 140 }}
        />
        <NumberInput name="quantity" label="Qty" min={0} decimalScale={2} placeholder="—" style={{ width: 70 }} />
        <Select name="unit" label="Unit" data={UNIT_OPTIONS} value={unit} onChange={setUnit} style={{ width: 95 }} />
        <Button type="submit" leftSection={<IconPlus size={16} />}>Add</Button>
      </Group>
    </Form>
  );
}

export default function Shopping({ loaderData }: Route.ComponentProps) {
  if (!loaderData.activeList) return <PrepareList scheduled={loaderData.scheduled} />;
  const { createdAt, listRecipes, listItems, allItems } = loaderData;

  const groups = groupByStoreAndShelf(listItems);
  const tickedCount = listItems.filter((i) => i.bought).length;

  // Which of the list's meals use each item
  const recipesByItem = new Map<number, string[]>();
  for (const recipe of listRecipes) {
    const label = recipe.count > 1 ? `${recipe.name} ×${recipe.count}` : recipe.name;
    for (const ing of recipe.ingredients) {
      recipesByItem.set(ing.itemId, [...(recipesByItem.get(ing.itemId) ?? []), label]);
    }
  }

  return (
    <Container size="sm" py="xl">
      <Group justify="space-between" mb="xs">
        <Title>Shopping</Title>
        <Text c="dimmed" size="sm">{tickedCount}/{listItems.length}</Text>
      </Group>
      <Text c="dimmed" size="sm">Created {createdAt}</Text>
      <ListMeals recipes={listRecipes} />

      {listItems.length === 0 && (
        <Text c="dimmed" mb="lg">No items on the list.</Text>
      )}

      {[...groups.entries()].map(([storeName, shelves]) => (
        <Stack key={storeName} mb="lg" gap="xs">
          <Text fw={600} size="sm" c="dimmed">{storeName}</Text>
          <Table>
            <Table.Tbody>
              {[...shelves.entries()].flatMap(([shelfName, shelfItems]) => [
                // No heading when nothing in this store has a shelf
                ...(shelfName != null || shelves.size > 1
                  ? [
                      <Table.Tr key={`shelf-${shelfName ?? ""}`}>
                        <Table.Td colSpan={4} pt="md" pb={4}>
                          <Text size="xs" fw={600} tt="uppercase" c="dimmed">{shelfName ?? "Other"}</Text>
                        </Table.Td>
                      </Table.Tr>,
                    ]
                  : []),
                ...shelfItems.map((item) => {
                  const ticked = item.bought;
                  return (
                    <Table.Tr key={item.id} opacity={ticked ? 0.5 : 1}>
                      <Table.Td>
                        <Text td={ticked ? "line-through" : undefined}>{item.itemName}</Text>
                        {recipesByItem.has(item.itemId) && (
                          <Text size="xs" c="dimmed">{recipesByItem.get(item.itemId)!.join(", ")}</Text>
                        )}
                        {item.source === "manual" && (
                          <Badge size="xs" variant="outline" color="gray">manual</Badge>
                        )}
                      </Table.Td>
                      <Table.Td style={{ width: 110 }} c="dimmed">
                        {formatAmounts(item.amounts)}
                      </Table.Td>
                      <Table.Td style={{ width: 60 }}>
                        {!ticked ? (
                          <Form method="post">
                            <input type="hidden" name="intent" value="tick" />
                            <input type="hidden" name="id" value={item.id} />
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
                }),
              ])}
            </Table.Tbody>
          </Table>
        </Stack>
      ))}

      {allItems.length > 0 && (
        <>
          <Divider my="md" />
          <AddItemForm items={allItems} />
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
