import { and, asc, eq, inArray } from "drizzle-orm";
import { itemKey } from "~/item-names";
import { type ParsedIngredient } from "~/recipe-import";
import { addNote, changeListMeals } from "~/shopping-list";
import { combineAmounts } from "~/units";
import { db } from "./client";
import { findOrCreateItems, mealServings } from "./recipes.server";
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

// Adds parsed items to a list by hand, with their notes, creating the items that don't exist yet
// (see findOrCreateItems). An item already on the list gets the amounts added up, and needs buying again.
export async function addItemsToList(listId: number, items: ParsedIngredient[]) {
  return db.transaction(async (tx) => {
    const { idsByKey, newItems, storeName } = await findOrCreateItems(tx, items);
    for (const { name, quantity, unit, note } of items) {
      const itemId = idsByKey.get(itemKey(name))!;
      const amounts = combineAmounts([{ quantity, unit }]);
      const notes = note ? [{ note, amounts }] : [];
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
        await tx.insert(schema.shoppingListItems).values({ shoppingListId: listId, itemId, amounts, notes, source: "manual" }).run();
      }
    }
    return { newItems, storeName };
  });
}
