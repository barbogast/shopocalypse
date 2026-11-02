import { and, asc, eq, max } from "drizzle-orm";
import { rotationOrder } from "~/meal-schedule";
import { sameIds } from "~/reorder";
import { db } from "./client";
import * as schema from "./schema";

// Puts the scheduled meals in the given order of their positions. The positions stay
// (cook links refer to them); the meals move between them. Ignored when the positions
// aren't exactly the scheduled ones, e.g. because the schedule changed on another phone.
export async function reorderSchedule(order: number[]) {
  await db.transaction(async (tx) => {
    const meals = await tx.select().from(schema.mealSchedule).orderBy(asc(schema.mealSchedule.position));
    if (!sameIds(meals.map((m) => m.position), order)) return;
    const byPosition = new Map(meals.map((m) => [m.position, m]));
    for (const [i, { position }] of meals.entries()) {
      const meal = byPosition.get(order[i])!;
      if (meal.position === position) continue;
      await tx.update(schema.mealSchedule)
        .set({ recipeId: meal.recipeId, servings: meal.servings })
        .where(eq(schema.mealSchedule.position, position))
        .run();
    }
  });
}

async function nextPosition() {
  const [{ last }] = await db.select({ last: max(schema.mealSchedule.position) }).from(schema.mealSchedule);
  return (last ?? 0) + 1;
}

// Adds a meal at the end of the schedule. Null servings means the recipe's serving size.
export async function scheduleRecipe(recipeId: number, servings: number | null) {
  const recipe = await db.select().from(schema.recipes).where(eq(schema.recipes.id, recipeId)).get();
  // Gone or archived since the page loaded
  if (!recipe || recipe.archived) return { error: "Dieses Rezept gibt es nicht mehr." };
  await db.insert(schema.mealSchedule).values({ position: await nextPosition(), recipeId, servings });
  return { error: null };
}

// Adds `count` meals from the auto-fill recipes in rotation order (see rotationOrder),
// going round again if more meals are asked for than there are recipes
export async function autoFill(count: number, servings: number | null) {
  const queue = await db
    .select({ recipeId: schema.mealSchedule.recipeId })
    .from(schema.mealSchedule)
    .orderBy(asc(schema.mealSchedule.position));
  const lastCooked = await db
    .select({ recipeId: schema.mealHistory.recipeId, lastDate: max(schema.mealHistory.cookedAt) })
    .from(schema.mealHistory)
    .groupBy(schema.mealHistory.recipeId);
  const recipes = await db
    .select({ id: schema.recipes.id })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.archived, false), eq(schema.recipes.autoFill, true)));

  const rotation = rotationOrder(recipes, queue.map((r) => r.recipeId), new Map(lastCooked.map((r) => [r.recipeId, r.lastDate])));
  if (rotation.length === 0) return { error: "Kein Rezept ist für das automatische Auffüllen vorgesehen." };

  const start = await nextPosition();
  await db.insert(schema.mealSchedule).values(
    Array.from({ length: count }, (_, i) => ({ position: start + i, recipeId: rotation[i % rotation.length].id, servings }))
  );
  return { error: null };
}
