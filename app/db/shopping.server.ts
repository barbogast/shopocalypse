import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { itemKey } from "~/item-names";
import { type ParsedIngredient } from "~/recipe-import";
import { addNote, changeListMeals, listAmounts, type ListNote } from "~/shopping-list";
import { type Amount, combineAmounts } from "~/units";
import { db } from "./client";
import { findOrCreateItems, mealServings, withIngredients } from "./recipes.server";
import * as schema from "./schema";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Meal = { recipeId: number; servings: number; servingSize: number };

// The one active shopping list (a unique index allows at most one), if any.
// Pass a transaction to read within it.
export async function getActiveList(q: typeof db | Tx = db) {
  return (await q.select().from(schema.shoppingLists).where(eq(schema.shoppingLists.status, "active")).get()) ?? null;
}

// What the given recipes need, as listAmounts takes it
export async function listIngredients(tx: Tx, recipeIds: number[]) {
  return tx
    .select({
      recipeId: schema.recipeIngredients.recipeId,
      itemId: schema.recipeIngredients.itemId,
      quantity: schema.recipeIngredients.quantity,
      unit: schema.recipeIngredients.unit,
      note: schema.recipeIngredients.note,
      noteOnList: schema.recipeIngredients.noteOnList,
      alwaysAvailable: schema.items.alwaysAvailable,
    })
    .from(schema.recipeIngredients)
    .innerJoin(schema.items, eq(schema.recipeIngredients.itemId, schema.items.id))
    .where(inArray(schema.recipeIngredients.recipeId, recipeIds))
    .all();
}

// The meals a list was prepared for, in the order they were added
export async function listMeals(tx: Tx, listId: number) {
  return tx
    .select({
      id: schema.shoppingListRecipes.id,
      recipeId: schema.shoppingListRecipes.recipeId,
      servings: mealServings(schema.shoppingListRecipes.servings),
      servingSize: schema.recipes.servingSize,
    })
    .from(schema.shoppingListRecipes)
    .innerJoin(schema.recipes, eq(schema.shoppingListRecipes.recipeId, schema.recipes.id))
    .where(eq(schema.shoppingListRecipes.shoppingListId, listId))
    .orderBy(asc(schema.shoppingListRecipes.id))
    .all();
}

// Changes a list's items to match its meals going from `before` to `after` (see changeListMeals)
export async function changeItemsForMeals(
  tx: Tx,
  list: { id: number; includeInStock: boolean },
  before: Meal[],
  after: Meal[],
) {
  const ingredients = await listIngredients(tx, [...new Set([...before, ...after].map((m) => m.recipeId))]);
  const listed = await tx
    .select({ id: schema.shoppingListItems.id, itemId: schema.shoppingListItems.itemId, amounts: schema.shoppingListItems.amounts, source: schema.shoppingListItems.source })
    .from(schema.shoppingListItems)
    .where(eq(schema.shoppingListItems.shoppingListId, list.id))
    .all();

  for (const change of changeListMeals(listed, before, after, ingredients, list.includeInStock)) {
    if (change.kind === "insert") {
      const { itemId, amounts, notes } = change;
      await tx.insert(schema.shoppingListItems).values({ shoppingListId: list.id, itemId, amounts, notes, source: "meal_plan" }).run();
    } else if (change.kind === "update") {
      const { amounts, notes, buyAgain } = change;
      await tx.update(schema.shoppingListItems)
        .set({ amounts, notes, ...(buyAgain && { bought: false }) })
        .where(eq(schema.shoppingListItems.id, change.id))
        .run();
    } else {
      await tx.delete(schema.shoppingListItems).where(eq(schema.shoppingListItems.id, change.id)).run();
    }
  }
}

// Adds an item to a list by hand. An item already on the list gets the amounts added up,
// and needs buying again.
async function addToList(tx: Tx, listId: number, itemId: number, amounts: Amount[], notes: ListNote[] = []) {
  const listed = await tx
    .select()
    .from(schema.shoppingListItems)
    .where(and(eq(schema.shoppingListItems.shoppingListId, listId), eq(schema.shoppingListItems.itemId, itemId)))
    .get();
  if (listed) {
    await tx.update(schema.shoppingListItems)
      .set({ amounts: combineAmounts([...listed.amounts, ...amounts]), notes: addNote(listed.notes, ...notes), bought: false })
      .where(eq(schema.shoppingListItems.id, listed.id))
      .run();
  } else {
    await tx.insert(schema.shoppingListItems)
      .values({ shoppingListId: listId, itemId, amounts: combineAmounts(amounts), notes, source: "manual" })
      .run();
  }
}

export async function addItemToList(listId: number, itemId: number, amount: Amount) {
  await db.transaction((tx) => addToList(tx, listId, itemId, [amount]));
}

// Adds parsed items to a list by hand, with their notes, creating the items that don't exist yet
// (see findOrCreateItems)
export async function addItemsToList(listId: number, items: ParsedIngredient[]) {
  return db.transaction(async (tx) => {
    const { idsByKey, newItems, storeName } = await findOrCreateItems(tx, items);
    for (const { name, quantity, unit, note } of items) {
      const amounts = combineAmounts([{ quantity, unit }]);
      await addToList(tx, listId, idsByKey.get(itemKey(name))!, amounts, note ? [{ note, amounts }] : []);
    }
    return { newItems, storeName };
  });
}

// Starts the active list with what the scheduled meals at these positions need.
// One transaction, so a double submit can't create a second active list.
export async function prepareList(positions: number[], includeInStock: boolean) {
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
}

type ActiveList = NonNullable<Awaited<ReturnType<typeof getActiveList>>>;

// Adds a meal to the list, and what it needs to the items. Null servings means the recipe's serving size.
export async function addMeal(list: ActiveList, recipeId: number, servings: number | null) {
  const recipe = await db.select().from(schema.recipes).where(eq(schema.recipes.id, recipeId)).get();
  if (!recipe || recipe.archived) return { error: "Dieses Rezept gibt es nicht mehr." };

  await db.transaction(async (tx) => {
    const before = await listMeals(tx, list.id);
    const added = { recipeId, servings: servings ?? recipe.servingSize, servingSize: recipe.servingSize };
    await tx.insert(schema.shoppingListRecipes).values({ shoppingListId: list.id, recipeId, servings }).run();
    await changeItemsForMeals(tx, list, before, [...before, added]);
  });
  return { error: null };
}

// Takes one of the list's meals off, along with what only it needed
export async function removeMeal(list: ActiveList, listRecipeId: number) {
  await db.transaction(async (tx) => {
    const before = await listMeals(tx, list.id);
    if (!before.some((m) => m.id === listRecipeId)) return;
    await tx.delete(schema.shoppingListRecipes).where(eq(schema.shoppingListRecipes.id, listRecipeId)).run();
    await changeItemsForMeals(tx, list, before, before.filter((m) => m.id !== listRecipeId));
  });
}

// Only rows on the active list: a tick sent again from the outbox may arrive after the list was finished
function onActiveList(listItemId: number) {
  return and(
    eq(schema.shoppingListItems.id, listItemId),
    inArray(
      schema.shoppingListItems.shoppingListId,
      db.select({ id: schema.shoppingLists.id }).from(schema.shoppingLists).where(eq(schema.shoppingLists.status, "active")),
    ),
  );
}

export async function setBought(listItemId: number, bought: boolean) {
  await db.update(schema.shoppingListItems).set({ bought }).where(onActiveList(listItemId));
}

export async function removeListItem(listItemId: number) {
  await db.delete(schema.shoppingListItems).where(onActiveList(listItemId));
}

// Stock tracking is deferred, so finishing doesn't add bought items to it
export async function finishList(listId: number) {
  await db.update(schema.shoppingLists).set({ status: "completed" }).where(eq(schema.shoppingLists.id, listId));
}

export async function discardList(listId: number) {
  await db.transaction(async (tx) => {
    await tx.delete(schema.shoppingListItems).where(eq(schema.shoppingListItems.shoppingListId, listId)).run();
    await tx.delete(schema.shoppingListRecipes).where(eq(schema.shoppingListRecipes.shoppingListId, listId)).run();
    await tx.delete(schema.shoppingLists).where(eq(schema.shoppingLists.id, listId)).run();
  });
}

// The scheduled meals, to pick from when preparing a list
export async function listScheduledMeals() {
  return db
    .select({
      position: schema.mealSchedule.position,
      name: schema.recipes.name,
      servings: mealServings(schema.mealSchedule.servings),
      servingSize: schema.recipes.servingSize,
    })
    .from(schema.mealSchedule)
    .innerJoin(schema.recipes, eq(schema.mealSchedule.recipeId, schema.recipes.id))
    .orderBy(asc(schema.mealSchedule.position));
}

// A list's items in shopping order, with their store and shelf
export async function listItemsInOrder(listId: number) {
  const parentItems = alias(schema.items, "parents");
  const listedParents = alias(schema.shoppingListItems, "listed_parents");
  // Indented under its parent only when the parent is on the list too and they share a shelf
  const isVariant = sql<boolean>`${listedParents.id} is not null and ${parentItems.storeId} is ${schema.items.storeId} and ${parentItems.categoryId} is ${schema.items.categoryId}`;
  return db
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
    .where(eq(schema.shoppingListItems.shoppingListId, listId))
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

// A list's meals with their ingredients, repeated ones counted
export async function listMealsWithRecipes(listId: number) {
  const rows = await db
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
    .where(eq(schema.shoppingListRecipes.shoppingListId, listId))
    .orderBy(asc(schema.shoppingListRecipes.id));
  return countRecipes(await withIngredients(rows));
}
