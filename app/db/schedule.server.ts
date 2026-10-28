import { and, asc, desc, eq, gt, lt, max } from "drizzle-orm";
import { rotationOrder } from "~/meal-schedule";
import { db } from "./client";
import * as schema from "./schema";

// Swaps a scheduled meal with the one before or after it (positions may have gaps)
export async function moveScheduledMeal(position: number, up: boolean) {
  await db.transaction(async (tx) => {
    const current = await tx.select().from(schema.mealSchedule).where(eq(schema.mealSchedule.position, position)).get();
    const neighbour = await tx
      .select()
      .from(schema.mealSchedule)
      .where(up ? lt(schema.mealSchedule.position, position) : gt(schema.mealSchedule.position, position))
      .orderBy(up ? desc(schema.mealSchedule.position) : asc(schema.mealSchedule.position))
      .limit(1)
      .get();
    if (!current || !neighbour) return;
    await tx.update(schema.mealSchedule)
      .set({ recipeId: neighbour.recipeId, servings: neighbour.servings })
      .where(eq(schema.mealSchedule.position, current.position))
      .run();
    await tx.update(schema.mealSchedule)
      .set({ recipeId: current.recipeId, servings: current.servings })
      .where(eq(schema.mealSchedule.position, neighbour.position))
      .run();
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
  if (!recipe || recipe.archived) return { error: "That recipe is no longer available." };
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
  if (rotation.length === 0) return { error: "No recipes are included in auto-fill." };

  const start = await nextPosition();
  await db.insert(schema.mealSchedule).values(
    Array.from({ length: count }, (_, i) => ({ position: start + i, recipeId: rotation[i % rotation.length].id, servings }))
  );
  return { error: null };
}
