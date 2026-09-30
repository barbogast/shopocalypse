import { asc, eq, inArray } from "drizzle-orm";
import { scaleAmount } from "~/units";
import { db } from "./client";
import { items, mealHistory, mealSchedule, recipeIngredients, recipes, shoppingListRecipes } from "./schema";

// Cook dates are stored as YYYY-MM-DD; format on the server so client and server render the same string
export function formatCookedAt(cookedAt: string) {
  return new Date(`${cookedAt}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

export function hasBeenCooked(recipeId: number) {
  return !!db.select().from(mealHistory).where(eq(mealHistory.recipeId, recipeId)).limit(1).get();
}

// Recipes with meal history are archived rather than deleted, so the
// "least recently cooked" rotation keeps its data. Either way the recipe
// leaves the schedule.
export function deleteOrArchiveRecipe(recipeId: number) {
  db.transaction((tx) => {
    tx.delete(mealSchedule).where(eq(mealSchedule.recipeId, recipeId)).run();
    if (hasBeenCooked(recipeId)) {
      tx.update(recipes).set({ archived: true }).where(eq(recipes.id, recipeId)).run();
    } else {
      tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId)).run();
      tx.delete(shoppingListRecipes).where(eq(shoppingListRecipes.recipeId, recipeId)).run();
      tx.delete(recipes).where(eq(recipes.id, recipeId)).run();
    }
  });
}

export function restoreRecipe(recipeId: number) {
  db.update(recipes).set({ archived: false }).where(eq(recipes.id, recipeId)).run();
}

// Attach each meal's ingredients, scaled to its servings
export async function withIngredients<T extends { id: number; servings: number; servingSize: number }>(meals: T[]) {
  const rows = meals.length
    ? await db
        .select({
          recipeId: recipeIngredients.recipeId,
          itemId: recipeIngredients.itemId,
          name: items.name,
          quantity: recipeIngredients.quantity,
          unit: recipeIngredients.unit,
        })
        .from(recipeIngredients)
        .innerJoin(items, eq(recipeIngredients.itemId, items.id))
        .where(inArray(recipeIngredients.recipeId, meals.map((m) => m.id)))
        .orderBy(asc(items.name))
    : [];
  return meals.map((m) => ({
    ...m,
    ingredients: rows
      .filter((i) => i.recipeId === m.id)
      .map((i) => ({ ...i, ...scaleAmount(i, m.servings, m.servingSize) })),
  }));
}
