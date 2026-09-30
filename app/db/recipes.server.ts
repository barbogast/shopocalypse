import { eq } from "drizzle-orm";
import { db } from "./client";
import { mealHistory, mealSchedule, recipeIngredients, recipes } from "./schema";

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
      tx.delete(recipes).where(eq(recipes.id, recipeId)).run();
    }
  });
}

export function restoreRecipe(recipeId: number) {
  db.update(recipes).set({ archived: false }).where(eq(recipes.id, recipeId)).run();
}
