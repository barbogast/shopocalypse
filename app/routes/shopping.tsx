import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Collapse,
  Container,
  CopyButton,
  Anchor,
  Divider,
  Group,
  List,
  Modal,
  NumberInput,
  Popover,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import {
  IconAlertCircle, IconCheck, IconChefHat, IconChevronDown, IconChevronRight, IconCopy, IconFileImport, IconPlus, IconShoppingCart, IconTrash,
} from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { Form, type ShouldRevalidateFunctionArgs, useActionData, useFetcher, useFetchers, useSubmit } from "react-router";
import { FormError } from "~/components/form-error";
import { IngredientName } from "~/components/ingredient-name";
import { ItemFields } from "~/components/item-fields";
import { itemSearchFilter } from "~/components/item-search";
import { LineGutter, TEXT_METRICS } from "~/components/line-gutter";
import { LocalDateTime } from "~/components/local-date-time";
import { PluralSuggestion } from "~/components/plural-suggestion";
import { RecipeDrawer } from "~/components/recipe-drawer";
import { Servings } from "~/components/servings";
import { SubmitButton } from "~/components/submit-button";
import { db } from "~/db/client";
import { listParents, listShelves, parseItemForm } from "~/db/items.server";
import { mealServings, withIngredients } from "~/db/recipes.server";
import { addItemsToList, changeItemsForMeals, getActiveList, listIngredients, listMeals } from "~/db/shopping.server";
import * as schema from "~/db/schema";
import { confirmFirst, int, text } from "~/forms";
import { itemKey, itemKeys, likelySingular } from "~/item-names";
import { parseItemsText } from "~/recipe-import";
import { listAmounts, listAsText } from "~/shopping-list";
import * as outbox from "~/tick-outbox";
import { groupByStoreAndShelf } from "~/store-shelf-groups";
import { combineAmounts, DEFAULT_UNIT, formatAmount, formatAmounts, nameForAmounts, parseAmount, UNIT_OPTIONS } from "~/units";
import { pageTitle } from "~/page-title";
import type { Route } from "./+types/shopping";

export function meta() {
  return [{ title: pageTitle("Shopping") }];
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
      position: schema.mealSchedule.position,
      name: schema.recipes.name,
      servings: mealServings(schema.mealSchedule.servings),
      servingSize: schema.recipes.servingSize,
    })
    .from(schema.mealSchedule)
    .innerJoin(schema.recipes, eq(schema.mealSchedule.recipeId, schema.recipes.id))
    .orderBy(asc(schema.mealSchedule.position));

  if (!activeList) {
    return { activeList: null, listItems: [], scheduled };
  }

  const parentItems = alias(schema.items, "parents");
  const listedParents = alias(schema.shoppingListItems, "listed_parents");
  // Indented under its parent only when the parent is on the list too and they share a shelf
  const isVariant = sql<boolean>`${listedParents.id} is not null and ${parentItems.storeId} is ${schema.items.storeId} and ${parentItems.categoryId} is ${schema.items.categoryId}`;
  const listItems = await db
    .select({
      id: schema.shoppingListItems.id,
      itemId: schema.shoppingListItems.itemId,
      isVariant: isVariant.mapWith(Boolean),
      itemName: schema.items.name,
      itemPlural: schema.items.plural,
      amounts: schema.shoppingListItems.amounts,
      notes: schema.shoppingListItems.notes,
      bought: schema.shoppingListItems.bought,
      source: schema.shoppingListItems.source,
      storeName: schema.stores.name,
      shelfName: schema.itemCategories.name,
    })
    .from(schema.shoppingListItems)
    .innerJoin(schema.items, eq(schema.shoppingListItems.itemId, schema.items.id))
    .leftJoin(schema.stores, eq(schema.items.storeId, schema.stores.id))
    .leftJoin(schema.itemCategories, eq(schema.items.categoryId, schema.itemCategories.id))
    .leftJoin(parentItems, eq(schema.items.parentId, parentItems.id))
    .leftJoin(listedParents, and(
      eq(listedParents.shoppingListId, schema.shoppingListItems.shoppingListId),
      eq(listedParents.itemId, schema.items.parentId),
    ))
    .where(eq(schema.shoppingListItems.shoppingListId, activeList.id))
    // Stores alphabetically, then shelves in walking order; items without a store or shelf go last.
    // Variants on their parent's shelf come right after it
    .orderBy(
      sql`${schema.stores.name} is null`,
      schema.stores.name,
      sql`${schema.itemCategories.position} is null`,
      schema.itemCategories.position,
      sql`case when ${isVariant} then ${parentItems.name} else ${schema.items.name} end collate nocase`,
      isVariant,
      sql`${schema.items.name} collate nocase`,
    );

  // Items already on the list can be added again to raise their amount
  const listedItemIds = new Set(listItems.map((i) => i.itemId));
  const allItems = await db
    .select({ id: schema.items.id, name: schema.items.name, plural: schema.items.plural, defaultUnit: schema.items.defaultUnit })
    .from(schema.items)
    .orderBy(sql`${schema.items.name} collate nocase`)
    .then((all) => all.map((i) => ({ ...i, listed: listedItemIds.has(i.id) })));

  const listRecipeRows = await db
    .select({
      listRecipeId: schema.shoppingListRecipes.id,
      id: schema.recipes.id,
      name: schema.recipes.name,
      servingSize: schema.recipes.servingSize,
      servings: mealServings(schema.shoppingListRecipes.servings),
      instructions: schema.recipes.instructions,
      comments: schema.recipes.comments,
      weblink: schema.recipes.weblink,
    })
    .from(schema.shoppingListRecipes)
    .innerJoin(schema.recipes, eq(schema.shoppingListRecipes.recipeId, schema.recipes.id))
    .where(eq(schema.shoppingListRecipes.shoppingListId, activeList.id))
    .orderBy(asc(schema.shoppingListRecipes.id));

  const listRecipes = countRecipes(await withIngredients(listRecipeRows));

  const allRecipes = await db
    .select({ id: schema.recipes.id, name: schema.recipes.name, servingSize: schema.recipes.servingSize })
    .from(schema.recipes)
    .where(eq(schema.recipes.archived, false))
    .orderBy(sql`${schema.recipes.name} collate nocase`);

  const allStores = await db.select().from(schema.stores).orderBy(schema.stores.name);

  return {
    activeList,
    listRecipes,
    listItems,
    scheduled,
    allItems,
    allRecipes,
    allStores,
    allShelves: await listShelves(),
    parents: await listParents(),
  };
}

function onActiveList(listItemId: number) {
  return and(
    eq(schema.shoppingListItems.id, listItemId),
    inArray(
      schema.shoppingListItems.shoppingListId,
      db.select({ id: schema.shoppingLists.id }).from(schema.shoppingLists).where(eq(schema.shoppingLists.status, "active")),
    ),
  );
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
                  recipeId: schema.mealSchedule.recipeId,
                  servings: mealServings(schema.mealSchedule.servings),
                  servingSize: schema.recipes.servingSize,
                })
                .from(schema.mealSchedule)
                .innerJoin(schema.recipes, eq(schema.mealSchedule.recipeId, schema.recipes.id))
                .where(inArray(schema.mealSchedule.position, positions))
                .orderBy(asc(schema.mealSchedule.position))
                .all()
            : [];

        const ingredients = await listIngredients(tx, scheduled.map((m) => m.recipeId));
        // Stock tracking is deferred (no units yet), so nothing is subtracted
        const toAdd = listAmounts(scheduled, ingredients, includeInStock);

        const list = await tx
          .insert(schema.shoppingLists)
          .values({ createdAt: new Date().toISOString(), status: "active", includeInStock })
          .returning()
          .get();

        if (scheduled.length > 0) {
          await tx.insert(schema.shoppingListRecipes)
            .values(scheduled.map((meal) => ({ shoppingListId: list.id, recipeId: meal.recipeId, servings: meal.servings })))
            .run();
        }

        if (toAdd.size > 0) {
          await tx.insert(schema.shoppingListItems)
            .values(
              [...toAdd.entries()].map(([itemId, { amounts, notes }]) => ({
                shoppingListId: list.id,
                itemId,
                amounts,
                notes,
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
          .from(schema.shoppingListItems)
          .where(and(eq(schema.shoppingListItems.shoppingListId, activeList.id), eq(schema.shoppingListItems.itemId, itemId)))
          .get();
        if (listed) {
          await tx.update(schema.shoppingListItems)
            .set({ amounts: combineAmounts([...listed.amounts, parsed.amount]), bought: false })
            .where(eq(schema.shoppingListItems.id, listed.id))
            .run();
        } else {
          await tx.insert(schema.shoppingListItems)
            .values({ shoppingListId: activeList.id, itemId, amounts: combineAmounts([parsed.amount]), source: "manual" })
            .run();
        }
      });
      break;
    }

    // Items pasted as text, one per line like a recipe's ingredients
    case "import-items": {
      const activeList = await getActiveList();
      if (!activeList) return null;

      // Parsed again here rather than trusting the preview
      const allItems = await db.select({ name: schema.items.name, plural: schema.items.plural }).from(schema.items);
      const { items, errors } = parseItemsText(text(form, "text"), allItems);
      if (errors.length) return { importError: "Fix the errors in the text first." };
      if (items.length === 0) return { importError: "List at least one item." };
      const { newItems } = await addItemsToList(activeList.id, items);
      return { itemsImported: { count: items.length, newItems: newItems.length } };
    }

    // New item from the item picker; it's then preselected for adding
    case "create-item": {
      const parsed = await parseItemForm(form);
      if (parsed.error) return { createError: parsed.error };
      const [item] = await db
        .insert(schema.items)
        .values(parsed.values)
        .returning({ id: schema.items.id, name: schema.items.name, plural: schema.items.plural, defaultUnit: schema.items.defaultUnit });
      return { createdItem: item };
    }

    case "add-recipe": {
      const activeList = await getActiveList();
      if (!activeList) return null;

      const recipeId = int(form, "recipeId");
      // Empty means the recipe's serving size
      const servings = int(form, "servings");
      if (!recipeId) return { addRecipeError: "Pick a recipe first." };
      if (text(form, "servings") && !servings) return { addRecipeError: "Servings must be a whole number of at least 1." };
      const recipe = await db.select().from(schema.recipes).where(eq(schema.recipes.id, recipeId)).get();
      if (!recipe || recipe.archived) return { addRecipeError: "That recipe is no longer available." };

      await db.transaction(async (tx) => {
        const before = await listMeals(tx, activeList.id);
        const added = { recipeId, servings: servings ?? recipe.servingSize, servingSize: recipe.servingSize };
        await tx.insert(schema.shoppingListRecipes).values({ shoppingListId: activeList.id, recipeId, servings }).run();
        await changeItemsForMeals(tx, activeList, before, [...before, added]);
      });
      // Tells the page to clear its recipe picker
      return { recipeAdded: true };
    }

    // Takes one of the list's meals off, along with what only it needed
    case "remove-recipe": {
      const activeList = await getActiveList();
      const id = int(form, "id");
      if (!activeList || !id) return null;

      await db.transaction(async (tx) => {
        const before = await listMeals(tx, activeList.id);
        if (!before.some((m) => m.id === id)) return;
        await tx.delete(schema.shoppingListRecipes).where(eq(schema.shoppingListRecipes.id, id)).run();
        await changeItemsForMeals(tx, activeList, before, before.filter((m) => m.id !== id));
      });
      break;
    }

    // Only on the active list: a tick sent again from the outbox may arrive after the list was finished
    case "tick":
    case "untick": {
      const id = int(form, "id");
      if (!id) return null;
      await db
        .update(schema.shoppingListItems)
        .set({ bought: intent === "tick" })
        .where(onActiveList(id));
      break;
    }

    case "remove-item": {
      const id = int(form, "id");
      if (!id) return null;
      await db.delete(schema.shoppingListItems).where(onActiveList(id));
      break;
    }

    case "finish": {
      const activeList = await getActiveList();
      if (!activeList) return null;

      // Stock tracking is deferred, so finishing doesn't add bought items to it
      await db
        .update(schema.shoppingLists)
        .set({ status: "completed" })
        .where(eq(schema.shoppingLists.id, activeList.id));
      break;
    }

    case "discard": {
      const activeList = await getActiveList();
      if (!activeList) return null;
      await db.transaction(async (tx) => {
        await tx.delete(schema.shoppingListItems).where(eq(schema.shoppingListItems.shoppingListId, activeList.id)).run();
        await tx.delete(schema.shoppingListRecipes).where(eq(schema.shoppingListRecipes.shoppingListId, activeList.id)).run();
        await tx.delete(schema.shoppingLists).where(eq(schema.shoppingLists.id, activeList.id)).run();
      });
      break;
    }
    default:
      throw new Response("Unknown intent", { status: 400 });
  }

  return null;
}

// Ticks go to the outbox first, and the fetcher actions never throw: a thrown
// error, even just from a lost connection, would replace the whole list with
// the error page
export async function clientAction({ request, serverAction }: Route.ClientActionArgs) {
  const form = await request.clone().formData();
  const intent = form.get("intent");
  const id = int(form, "id");

  if ((intent === "tick" || intent === "untick") && id) {
    const bought = intent === "tick";
    outbox.queue(id, bought);
    try {
      await serverAction();
      outbox.markSynced(id, bought);
    } catch {
      // Stays in the outbox and is sent again later
    }
    return null;
  }
  if (intent === "remove-item") {
    try {
      return await serverAction();
    } catch {
      return { removeError: "Couldn't remove it. Try again." };
    }
  }
  return serverAction();
}

// The outbox keeps ticks showing, so reloading the whole list after each one
// would only cost round trips in the shop. Changes made on another device show
// on the next visit to the page.
export function shouldRevalidate({ formData, actionResult, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  const intent = formData?.get("intent");
  if (intent === "tick" || intent === "untick") return false;
  // The reload would fail the same way, and show the error page
  if (actionResult?.removeError) return false;
  return defaultShouldRevalidate;
}

// Sends the outbox's unsent ticks when there's a chance they'll get through:
// on load, when the connection or the page comes back, and every 30 seconds,
// since the phone can claim to be online with too little reception to use
function useFlushOutbox() {
  const submit = useSubmit();

  useEffect(() => {
    const flush = () => {
      for (const { id, bought } of outbox.unsynced(outbox.getSnapshot())) {
        // One fetcher per item, so a resend replaces the previous attempt
        submit({ intent: bought ? "tick" : "untick", id }, { method: "post", navigate: false, fetcherKey: `outbox-${id}` });
      }
    };
    const onVisible = () => document.visibilityState === "visible" && flush();
    flush();
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(flush, 30_000);
    return () => {
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [submit]);
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

// The list's meals, folded away behind a toggle to keep the page short;
// tapping a recipe opens its details without leaving the list
function ListMeals({ recipes, allRecipes }: { recipes: ListRecipe[]; allRecipes: ActiveListData["allRecipes"] }) {
  const [shown, setShown] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = recipes.find((r) => r.key === openKey);

  const mealCount = recipes.reduce((sum, r) => sum + r.count, 0);

  return (
    <>
      <Stack gap={4} mb="lg" align="flex-start">
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          px={0}
          leftSection={shown ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          onClick={() => setShown((s) => !s)}
          aria-expanded={shown}
        >
          {mealCount === 0 ? "No meals" : mealCount === 1 ? "1 meal" : `${mealCount} meals`}
        </Button>
        <Collapse expanded={shown}>
          <Stack gap="sm">
            {recipes.length > 0 && (
              <List size="sm" c="dimmed">
                {recipes.map((r) => (
                  <List.Item key={r.key}>
                    <Group gap={4} wrap="nowrap">
                      <span>
                        <Anchor component="button" type="button" size="sm" onClick={() => setOpenKey(r.key)}>
                          {r.name}
                        </Anchor>
                        {r.servings !== r.servingSize && <Servings servings={r.servings} />}
                        {r.count > 1 && ` ×${r.count}`}
                      </span>
                      {/* Takes off one of a repeated meal at a time */}
                      <Form method="post">
                        <input type="hidden" name="intent" value="remove-recipe" />
                        <input type="hidden" name="id" value={r.listRecipeId} />
                        <SubmitButton size="compact-xs" variant="subtle" color="red" px={4} aria-label={`Remove ${r.name}`}>
                          <IconTrash size={12} />
                        </SubmitButton>
                      </Form>
                    </Group>
                  </List.Item>
                ))}
              </List>
            )}
            {allRecipes.length > 0 && <AddRecipeForm recipes={allRecipes} />}
          </Stack>
        </Collapse>
      </Stack>

      <RecipeDrawer
        recipe={open}
        note={open && open.count > 1 ? `on this list ×${open.count}` : undefined}
        onClose={() => setOpenKey(null)}
      />
    </>
  );
}

// Adds a meal to the list, and what it needs to the items
function AddRecipeForm({ recipes }: { recipes: ActiveListData["allRecipes"] }) {
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const actionData = useActionData<typeof action>();
  const servingSize = recipes.find((r) => String(r.id) === recipeId)?.servingSize;

  // Clear the picker once the meal is on the list
  useEffect(() => {
    if (actionData && "recipeAdded" in actionData) setRecipeId(null);
  }, [actionData]);

  return (
    <Form method="post">
      <input type="hidden" name="intent" value="add-recipe" />
      <Group align="flex-end" gap="xs">
        <Select
          name="recipeId"
          label="Add meal"
          data={recipes.map((r) => ({ value: String(r.id), label: r.name }))}
          value={recipeId}
          onChange={setRecipeId}
          searchable
          placeholder="Pick a recipe…"
          style={{ flex: 1, minWidth: 140 }}
        />
        {/* Empty uses the recipe's serving size */}
        <NumberInput
          key={recipeId}
          name="servings"
          label="Servings"
          min={1}
          allowDecimal={false}
          placeholder={servingSize ? String(servingSize) : "—"}
          style={{ width: 80 }}
        />
        <SubmitButton leftSection={<IconPlus size={16} />}>Add</SubmitButton>
      </Group>
      <FormError error={actionData && "addRecipeError" in actionData ? actionData.addRecipeError : null} mt="xs" />
    </Form>
  );
}

// Manually add an item; the unit starts on the item's default unit.
// Searching for an item that doesn't exist yet offers to create it
function AddItemForm({ items, stores, shelves, parents }: {
  items: { id: number; name: string; plural: string | null; defaultUnit: string | null; listed: boolean }[];
  stores: ActiveListData["allStores"];
  shelves: ActiveListData["allShelves"];
  parents: ActiveListData["parents"];
}) {
  const [itemId, setItemId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState<string | null>(DEFAULT_UNIT);
  const [createOpened, createModal] = useDisclosure(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const actionData = useActionData<typeof action>();

  // Offer to create the searched-for item when no item has that name or plural yet
  const searchName = search.trim();
  const canCreate = searchName !== "" && !items.some((i) => itemKeys(i).includes(itemKey(searchName)));
  const itemOptions = items.map((i) => ({ value: String(i.id), label: i.listed ? `${i.name} (on list)` : i.name }));
  if (canCreate) itemOptions.push({ value: "__create__", label: `+ Create "${searchName}"` });

  const selectItem = (item: { id: number; name: string; defaultUnit: string | null } | undefined) => {
    setItemId(item ? String(item.id) : null);
    setSearch(item?.name ?? "");
    setUnit(item?.defaultUnit ?? DEFAULT_UNIT);
  };

  useEffect(() => {
    if (actionData && "createError" in actionData) setCreateError(actionData.createError ?? null);
    // Arrives before the loader reruns, so the new item isn't in items yet
    if (actionData && "createdItem" in actionData) {
      createModal.close();
      selectItem(actionData.createdItem);
      quantityRef.current?.focus();
    }
  }, [actionData]);

  return (
    <>
      <Form method="post">
        <input type="hidden" name="intent" value="add-manual" />
        <Group align="flex-end" gap="xs">
          <Select
            name="itemId"
            label="Add item"
            data={itemOptions}
            value={itemId}
            searchable
            filter={itemSearchFilter(items)}
            searchValue={search}
            onSearchChange={setSearch}
            placeholder="Search or create…"
            onChange={(value) => {
              if (value === "__create__") {
                setCreateName(searchName);
                setCreateError(null);
                createModal.open();
              } else {
                selectItem(items.find((i) => String(i.id) === value));
              }
            }}
            style={{ flex: 1, minWidth: 140 }}
          />
          <NumberInput ref={quantityRef} name="quantity" label="Qty" min={0} decimalScale={2} decimalSeparator=","
            placeholder="—" style={{ width: 70 }} />
          <Select name="unit" label="Unit" data={UNIT_OPTIONS} value={unit} onChange={setUnit} style={{ width: 120 }} />
          <SubmitButton leftSection={<IconPlus size={16} />}>Add</SubmitButton>
        </Group>
        <FormError error={actionData && "addError" in actionData ? actionData.addError : null} mt="xs" />
      </Form>

      {/* No returnFocus: it would take focus back from the quantity field to the item picker */}
      <Modal opened={createOpened} onClose={createModal.close} title="New item" returnFocus={false}>
        <Form method="post">
          <input type="hidden" name="intent" value="create-item" />
          <Stack>
            <ItemFields
              stores={stores}
              shelves={shelves}
              parents={parents}
              defaults={{ name: createName, defaultUnit: unit }}
              autoFocus
            />
            <FormError error={createError} />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={createModal.close}>Cancel</Button>
              <SubmitButton>Create</SubmitButton>
            </Group>
          </Stack>
        </Form>
      </Modal>
    </>
  );
}

const IMPORT_PLACEHOLDER = `500 g Tomaten
2 Zwiebeln
Salz
200 ml Sahne - mind. 30% Fett`;

// Adds several items at once from text, one per line in the recipe import's ingredient format,
// with a preview of what each line becomes. Notes go on the list with the item.
function ImportItemsButton({ items }: { items: { id: number; name: string; plural: string | null }[] }) {
  const [opened, modal] = useDisclosure(false);
  const [input, setInput] = useState("");
  const actionData = useActionData<typeof action>();
  const { items: parsed, errors } = useMemo(() => parseItemsText(input, items), [input, items]);
  const knownItems = useMemo(() => new Set(items.flatMap(itemKeys)), [items]);
  const errorLines = new Set(errors.flatMap((e) => (e.line != null ? [e.line] : [])));
  const newItemCount = parsed.filter((i) => !knownItems.has(itemKey(i.name))).length;
  const canImport = parsed.length > 0 && errors.length === 0;

  // Done once the items are on the list
  useEffect(() => {
    if (actionData && "itemsImported" in actionData) {
      modal.close();
      setInput("");
    }
  }, [actionData]);

  return (
    <>
      <Button variant="subtle" size="compact-sm" mt="xs" leftSection={<IconFileImport size={14} />} onClick={modal.open}>
        Paste items
      </Button>
      <Modal opened={opened} onClose={modal.close} title="Paste items" size="lg">
        {/* The preview stays outside the form, since its plural suggestions are forms of their own */}
        <Stack>
          <Form method="post" id="import-items">
            <input type="hidden" name="intent" value="import-items" />
            <Textarea
              name="text"
              description="One item per line, like a recipe's ingredients: quantity, unit, name, and a note after “ - ”"
              placeholder={IMPORT_PLACEHOLDER}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              autosize
              minRows={6}
              data-autofocus
              styles={{ input: TEXT_METRICS }}
              inputContainer={(children) => (
                <div style={{ position: "relative" }}>
                  {children}
                  {input !== "" && <LineGutter text={input} errorLines={errorLines} />}
                </div>
              )}
            />
          </Form>
          {errors.length > 0 && (
            <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} py="xs">
              <List size="sm">
                {errors.map((e, i) => (
                  <List.Item key={i}>{e.line != null && <b>Line {e.line}: </b>}{e.message}</List.Item>
                ))}
              </List>
            </Alert>
          )}
          {parsed.length > 0 && (
            <Table>
              <Table.Tbody>
                {parsed.map((ing) => (
                  <Table.Tr key={ing.line}>
                    <Table.Td c="dimmed" ta="right" style={{ width: 90, verticalAlign: "top" }}>{formatAmount(ing)}</Table.Td>
                    <Table.Td>
                      <IngredientName {...ing}>
                        {!knownItems.has(itemKey(ing.name)) && (
                          <>
                            <Badge size="xs" variant="light" color="orange" ml={6}>new item</Badge>
                            <PluralSuggestion name={ing.name} singular={likelySingular(ing.name, items)} />
                          </>
                        )}
                      </IngredientName>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          <FormError error={actionData && "importError" in actionData ? actionData.importError : null} />
          <Group>
            <SubmitButton form="import-items" disabled={!canImport} leftSection={<IconPlus size={16} />}>
              Add {parsed.length || ""} item{parsed.length === 1 ? "" : "s"}
            </SubmitButton>
            {canImport && newItemCount > 0 && (
              <Text size="sm" c="dimmed">Creates {newItemCount} new item{newItemCount === 1 ? "" : "s"}</Text>
            )}
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

// One line of the list. Ticking and removing go through a fetcher, so the row
// updates at once instead of waiting for the server and a reload of the list.
function ListItemRow({ item, usedIn }: { item: ListItem; usedIn: string[] | undefined }) {
  const fetcher = useFetcher<typeof clientAction>();
  const ticked = item.bought;

  return (
    <Table.Tr opacity={ticked ? 0.5 : 1}>
      {/* Right-aligned and level with the name, so the two read as one phrase: "650 g Karotten" */}
      <Table.Td style={{ width: 110, verticalAlign: "top" }} ta="right">
        <Text c="dimmed">{formatAmounts(item.amounts)}</Text>
      </Table.Td>
      <Table.Td pl={item.isVariant ? "xl" : undefined}>
        <Group gap={4} wrap="nowrap">
          <Text td={ticked ? "line-through" : undefined}>
            {nameForAmounts({ name: item.itemName, plural: item.itemPlural }, item.amounts)}
          </Text>
          {/* Which meals need it, on request only, so it doesn't crowd the list */}
          {usedIn && (
            <Popover position="bottom-start" shadow="sm">
              <Popover.Target>
                <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Meals using ${item.itemName}`}>
                  <IconChefHat size={14} />
                </ActionIcon>
              </Popover.Target>
              <Popover.Dropdown>
                {usedIn.map((name) => <Text key={name} size="sm">{name}</Text>)}
              </Popover.Dropdown>
            </Popover>
          )}
        </Group>
        {item.notes.map((n) => (
          <Text key={n.note} size="sm" c="dimmed">
            {n.amounts.length > 0 && `${formatAmounts(n.amounts)} `}{n.note}
          </Text>
        ))}
        {item.source === "manual" && (
          <Badge size="xs" variant="outline" color="gray">manual</Badge>
        )}
        <FormError error={fetcher.data && "removeError" in fetcher.data ? fetcher.data.removeError : null} mt="xs" />
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

function ListView({
  activeList,
  listRecipes,
  listItems: loadedItems,
  allItems,
  allRecipes,
  allStores,
  allShelves,
  parents,
}: ActiveListData) {
  const entries = useSyncExternalStore(outbox.subscribe, outbox.getSnapshot, outbox.getServerSnapshot);
  const fetchers = useFetchers();
  const listItems = withPendingChanges(outbox.applyEntries(loadedItems, entries), fetchers);
  // Not counting ticks still on their way, so a tick that goes through doesn't flash this up
  const sending = new Set(fetchers.filter((f) => f.formData).map((f) => Number(f.formData!.get("id"))));
  const unsentCount = outbox.unsynced(entries).filter((e) => !sending.has(e.id)).length;
  useFlushOutbox();

  // Each fresh load of the list has what the server already got
  useEffect(() => outbox.settle(loadedItems), [loadedItems]);

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
        <Group gap="sm">
          {unsentCount > 0 && <Text c="orange" size="sm">{unsentCount} not saved yet</Text>}
          <Text c="dimmed" size="sm">{tickedCount}/{listItems.length}</Text>
          {/* Copies what's still to buy, to paste into another app */}
          <CopyButton value={listAsText(listItems)}>
            {({ copied, copy }) => (
              <Button
                size="xs"
                variant="light"
                color={copied ? "green" : undefined}
                leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                disabled={tickedCount === listItems.length}
                onClick={copy}
              >
                {copied ? "Copied" : "Copy list"}
              </Button>
            )}
          </CopyButton>
        </Group>
      </Group>
      <Text c="dimmed" size="sm">Created <LocalDateTime iso={activeList.createdAt} /></Text>
      <ListMeals recipes={listRecipes} allRecipes={allRecipes} />

      {listItems.length === 0 && (
        <Text c="dimmed" mb="lg">No items on the list.</Text>
      )}

      {[...groups.entries()].map(([storeName, shelves]) => (
        <Stack key={storeName} mb="lg" gap="xs">
          <Title order={4}>{storeName}</Title>
          <Table>
            <Table.Tbody>
              {[...shelves.entries()].flatMap(([shelfName, shelfItems]) => [
                // No heading when nothing in this store has a shelf
                ...(shelfName != null || shelves.size > 1
                  ? [
                      // A tinted band, so the shelves stand apart from the items between them
                      <Table.Tr key={`shelf-${shelfName ?? ""}`} bg="var(--mantine-color-gray-light)">
                        <Table.Td colSpan={4} py={6}>
                          <Text size="sm" fw={700}>{shelfName ?? "Other"}</Text>
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

      <Divider my="md" />
      <AddItemForm items={allItems} stores={allStores} shelves={allShelves} parents={parents} />
      <ImportItemsButton items={allItems} />

      <Divider my="lg" />
      <Group>
        <Form method="post">
          <input type="hidden" name="intent" value="finish" />
          <SubmitButton color="green" disabled={tickedCount === 0}>
            Finish shopping
          </SubmitButton>
        </Form>
        <Form method="post" onSubmit={confirmFirst("Discard this shopping list and everything on it?")}>
          <input type="hidden" name="intent" value="discard" />
          <SubmitButton variant="subtle" color="red">Discard list</SubmitButton>
        </Form>
      </Group>
    </Container>
  );
}
