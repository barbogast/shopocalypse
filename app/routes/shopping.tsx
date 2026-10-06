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
import { IconCheck, IconPlus, IconShoppingCart, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Form, useActionData, useFetcher, useFetchers } from "react-router";
import { FormError } from "~/components/form-error";
import { LocalDateTime } from "~/components/local-date-time";
import { RecipeDrawer } from "~/components/recipe-drawer";
import { Servings } from "~/components/servings";
import { SubmitButton } from "~/components/submit-button";
import { db } from "~/db/client";
import { mealServings, withIngredients } from "~/db/recipes.server";
import { getActiveList } from "~/db/shopping.server";
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
import { int } from "~/forms";
import { listAmounts } from "~/shopping-list";
import { combineAmounts, DEFAULT_UNIT, formatAmounts, parseAmount, UNIT_OPTIONS } from "~/units";
import type { Route } from "./+types/shopping";

export function meta() {
  return [{ title: "Shopping – Shopocalypse" }];
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
  const activeList = await getActiveList();

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

  // Items already on the list can be added again to raise their amount
  const listedItemIds = new Set(listItems.map((i) => i.itemId));
  const allItems = await db
    .select({ id: items.id, name: items.name, defaultUnit: items.defaultUnit })
    .from(items)
    .orderBy(items.name)
    .then((all) => all.map((i) => ({ ...i, listed: listedItemIds.has(i.id) })));

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

  return { activeList, listRecipes, listItems, scheduled, allItems };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent");

  switch (intent) {
    case "prepare": {
      const positions = form.getAll("position").map(Number).filter(Number.isInteger);
      const includeInStock = form.get("includeInStock") === "on";

      // One transaction, so a double submit can't create a second active list
      await db.transaction(async (tx) => {
        if (await getActiveList(tx)) return;

        const scheduled =
          positions.length > 0
            ? await tx
                .select({
                  recipeId: mealSchedule.recipeId,
                  servings: mealServings(mealSchedule.servings),
                  servingSize: recipes.servingSize,
                })
                .from(mealSchedule)
                .innerJoin(recipes, eq(mealSchedule.recipeId, recipes.id))
                .where(inArray(mealSchedule.position, positions))
                .orderBy(asc(mealSchedule.position))
                .all()
            : [];

        const ingredients = await tx
          .select({
            recipeId: recipeIngredients.recipeId,
            itemId: recipeIngredients.itemId,
            quantity: recipeIngredients.quantity,
            unit: recipeIngredients.unit,
            alwaysAvailable: items.alwaysAvailable,
          })
          .from(recipeIngredients)
          .innerJoin(items, eq(recipeIngredients.itemId, items.id))
          .where(inArray(recipeIngredients.recipeId, scheduled.map((m) => m.recipeId)))
          .all();
        // Stock tracking is deferred (no units yet), so nothing is subtracted
        const toAdd = listAmounts(scheduled, ingredients, includeInStock);

        const list = await tx
          .insert(shoppingLists)
          .values({ createdAt: new Date().toISOString(), status: "active" })
          .returning()
          .get();

        if (scheduled.length > 0) {
          await tx.insert(shoppingListRecipes)
            .values(scheduled.map((meal) => ({ shoppingListId: list.id, recipeId: meal.recipeId, servings: meal.servings })))
            .run();
        }

        if (toAdd.size > 0) {
          await tx.insert(shoppingListItems)
            .values(
              [...toAdd.entries()].map(([itemId, amounts]) => ({
                shoppingListId: list.id,
                itemId,
                amounts,
                source: "meal_plan" as const,
              }))
            )
            .run();
        }
      });
      break;
    }

    case "add-manual": {
      const activeList = await getActiveList();
      if (!activeList) return null;

      const itemId = int(form, "itemId");
      const parsed = parseAmount(form);
      if (!itemId) return { addError: "Pick an item first." };
      if ("error" in parsed) return { addError: parsed.error };
      // An item already on the list gets the amounts added up, and needs buying again
      await db.transaction(async (tx) => {
        const listed = await tx
          .select()
          .from(shoppingListItems)
          .where(and(eq(shoppingListItems.shoppingListId, activeList.id), eq(shoppingListItems.itemId, itemId)))
          .get();
        if (listed) {
          await tx.update(shoppingListItems)
            .set({ amounts: combineAmounts([...listed.amounts, parsed.amount]), bought: false })
            .where(eq(shoppingListItems.id, listed.id))
            .run();
        } else {
          await tx.insert(shoppingListItems)
            .values({ shoppingListId: activeList.id, itemId, amounts: combineAmounts([parsed.amount]), source: "manual" })
            .run();
        }
      });
      break;
    }

    case "tick": {
      const id = int(form, "id");
      if (!id) return null;
      await db
        .update(shoppingListItems)
        .set({ bought: true })
        .where(eq(shoppingListItems.id, id));
      break;
    }

    case "untick": {
      const id = int(form, "id");
      if (!id) return null;
      await db
        .update(shoppingListItems)
        .set({ bought: false })
        .where(eq(shoppingListItems.id, id));
      break;
    }

    case "remove-item": {
      const id = int(form, "id");
      if (!id) return null;
      await db.delete(shoppingListItems).where(eq(shoppingListItems.id, id));
      break;
    }

    case "finish": {
      const activeList = await getActiveList();
      if (!activeList) return null;

      // Stock tracking is deferred, so finishing doesn't add bought items to it
      await db
        .update(shoppingLists)
        .set({ status: "completed" })
        .where(eq(shoppingLists.id, activeList.id));
      break;
    }

    case "discard": {
      const activeList = await getActiveList();
      if (!activeList) return null;
      await db.transaction(async (tx) => {
        await tx.delete(shoppingListItems).where(eq(shoppingListItems.shoppingListId, activeList.id)).run();
        await tx.delete(shoppingListRecipes).where(eq(shoppingListRecipes.shoppingListId, activeList.id)).run();
        await tx.delete(shoppingLists).where(eq(shoppingLists.id, activeList.id)).run();
      });
      break;
    }
    default:
      throw new Response("Unknown intent", { status: 400 });
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
          <SubmitButton leftSection={<IconShoppingCart size={16} />}>
            {selected.size > 0 ? "Prepare list" : "Start empty list"}
          </SubmitButton>
        </Stack>
      </Form>
    </Container>
  );
}

type ActiveListData = Extract<Awaited<ReturnType<typeof loader>>, { activeList: object }>;
type ListRecipe = ActiveListData["listRecipes"][number];
type ListItem = ActiveListData["listItems"][number];

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
function AddItemForm({ items }: { items: { id: number; name: string; defaultUnit: string | null; listed: boolean }[] }) {
  const [unit, setUnit] = useState<string | null>(DEFAULT_UNIT);
  const actionData = useActionData<typeof action>();

  return (
    <Form method="post">
      <input type="hidden" name="intent" value="add-manual" />
      <Group align="flex-end" gap="xs">
        <Select
          name="itemId"
          label="Add item"
          data={items.map((i) => ({ value: String(i.id), label: i.listed ? `${i.name} (on list)` : i.name }))}
          searchable
          placeholder="Select item…"
          onChange={(value) => setUnit(items.find((i) => String(i.id) === value)?.defaultUnit ?? DEFAULT_UNIT)}
          style={{ flex: 1, minWidth: 140 }}
        />
        <NumberInput name="quantity" label="Qty" min={0} decimalScale={2} placeholder="—" style={{ width: 70 }} />
        <Select name="unit" label="Unit" data={UNIT_OPTIONS} value={unit} onChange={setUnit} style={{ width: 95 }} />
        <SubmitButton leftSection={<IconPlus size={16} />}>Add</SubmitButton>
      </Group>
      <FormError error={actionData?.addError} mt="xs" />
    </Form>
  );
}

// One line of the list. Ticking and removing go through a fetcher, so the row
// updates at once instead of waiting for the server and a reload of the list.
function ListItemRow({ item, usedIn }: { item: ListItem; usedIn: string[] | undefined }) {
  const fetcher = useFetcher();
  const ticked = item.bought;

  return (
    <Table.Tr opacity={ticked ? 0.5 : 1}>
      <Table.Td>
        <Text td={ticked ? "line-through" : undefined}>{item.itemName}</Text>
        {usedIn && <Text size="xs" c="dimmed">{usedIn.join(", ")}</Text>}
        {item.source === "manual" && (
          <Badge size="xs" variant="outline" color="gray">manual</Badge>
        )}
      </Table.Td>
      <Table.Td style={{ width: 110 }} c="dimmed">
        {formatAmounts(item.amounts)}
      </Table.Td>
      <Table.Td style={{ width: 60 }}>
        <fetcher.Form method="post">
          <input type="hidden" name="id" value={item.id} />
          {!ticked ? (
            <Button type="submit" name="intent" value="tick" size="xs" color="green" px={6} aria-label={`Tick off ${item.itemName}`}>
              <IconCheck size={14} />
            </Button>
          ) : (
            <Button type="submit" name="intent" value="untick" size="xs" variant="subtle">Undo</Button>
          )}
        </fetcher.Form>
      </Table.Td>
      <Table.Td style={{ width: 32 }}>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="remove-item" />
          <input type="hidden" name="id" value={item.id} />
          <Button type="submit" size="xs" variant="subtle" color="red" px={4} aria-label={`Remove ${item.itemName}`}>
            <IconTrash size={12} />
          </Button>
        </fetcher.Form>
      </Table.Td>
    </Table.Tr>
  );
}

// Applies ticks and removals that are still on their way to the server
function withPendingChanges(listItems: ListItem[], fetchers: ReturnType<typeof useFetchers>) {
  const pending = new Map<number, FormDataEntryValue | null>();
  for (const f of fetchers) {
    if (f.formData) pending.set(Number(f.formData.get("id")), f.formData.get("intent"));
  }
  return listItems
    .filter((i) => pending.get(i.id) !== "remove-item")
    .map((i) => {
      const intent = pending.get(i.id);
      return intent === "tick" ? { ...i, bought: true } : intent === "untick" ? { ...i, bought: false } : i;
    });
}

export default function Shopping({ loaderData }: Route.ComponentProps) {
  if (!loaderData.activeList) return <PrepareList scheduled={loaderData.scheduled} />;
  return <ListView {...loaderData} />;
}

function ListView({ activeList, listRecipes, listItems: loadedItems, allItems }: ActiveListData) {
  const listItems = withPendingChanges(loadedItems, useFetchers());

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
      <Text c="dimmed" size="sm">Created <LocalDateTime iso={activeList.createdAt} /></Text>
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
                ...shelfItems.map((item) => (
                  <ListItemRow key={item.id} item={item} usedIn={recipesByItem.get(item.itemId)} />
                )),
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
          <SubmitButton color="green" disabled={tickedCount === 0}>
            Finish shopping
          </SubmitButton>
        </Form>
        <Form method="post">
          <input type="hidden" name="intent" value="discard" />
          <SubmitButton variant="subtle" color="red">Discard list</SubmitButton>
        </Form>
      </Group>
    </Container>
  );
}
