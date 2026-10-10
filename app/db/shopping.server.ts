import { asc, eq, inArray } from "drizzle-orm";
import { changeListMeals } from "~/shopping-list";
import { db } from "./client";
import { mealServings } from "./recipes.server";
import { items, recipeIngredients, recipes, shoppingListItems, shoppingListRecipes, shoppingLists } from "./schema";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Meal = { recipeId: number; servings: number; servingSize: number };

// The one active shopping list (a unique index allows at most one), if any.
// Pass a transaction to read within it.
export async function getActiveList(q: typeof db | Tx = db) {
  return (await q.select().from(shoppingLists).where(eq(shoppingLists.status, "active")).get()) ?? null;
}

// What the given recipes need, as listAmounts takes it
export async function listIngredients(tx: Tx, recipeIds: number[]) {
  return tx
    .select({
      recipeId: recipeIngredients.recipeId,
      itemId: recipeIngredients.itemId,
      quantity: recipeIngredients.quantity,
      unit: recipeIngredients.unit,
      note: recipeIngredients.note,
      noteOnList: recipeIngredients.noteOnList,
      alwaysAvailable: items.alwaysAvailable,
    })
    .from(recipeIngredients)
    .innerJoin(items, eq(recipeIngredients.itemId, items.id))
    .where(inArray(recipeIngredients.recipeId, recipeIds))
    .all();
}

// The meals a list was prepared for, in the order they were added
export async function listMeals(tx: Tx, listId: number) {
  return tx
    .select({
      id: shoppingListRecipes.id,
      recipeId: shoppingListRecipes.recipeId,
      servings: mealServings(shoppingListRecipes.servings),
      servingSize: recipes.servingSize,
    })
    .from(shoppingListRecipes)
    .innerJoin(recipes, eq(shoppingListRecipes.recipeId, recipes.id))
    .where(eq(shoppingListRecipes.shoppingListId, listId))
    .orderBy(asc(shoppingListRecipes.id))
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
    .select({ id: shoppingListItems.id, itemId: shoppingListItems.itemId, amounts: shoppingListItems.amounts, source: shoppingListItems.source })
    .from(shoppingListItems)
    .where(eq(shoppingListItems.shoppingListId, list.id))
    .all();

  for (const change of changeListMeals(listed, before, after, ingredients, list.includeInStock)) {
    if (change.kind === "insert") {
      const { itemId, amounts, notes } = change;
      await tx.insert(shoppingListItems).values({ shoppingListId: list.id, itemId, amounts, notes, source: "meal_plan" }).run();
    } else if (change.kind === "update") {
      const { amounts, notes, buyAgain } = change;
      await tx.update(shoppingListItems)
        .set({ amounts, notes, ...(buyAgain && { bought: false }) })
        .where(eq(shoppingListItems.id, change.id))
        .run();
    } else {
      await tx.delete(shoppingListItems).where(eq(shoppingListItems.id, change.id)).run();
    }
  }
}
