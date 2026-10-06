import { asc, eq, inArray, sql } from "drizzle-orm";
import { itemKey, type ParsedRecipe } from "~/recipe-import";
import { scaleAmount } from "~/units";
import { db } from "./client";
import { items, mealHistory, mealSchedule, recipeIngredients, recipes, shoppingListRecipes } from "./schema";

// Cook dates are stored as YYYY-MM-DD; format on the server so client and server render the same string
export function formatCookedAt(cookedAt: string) {
  return new Date(`${cookedAt}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

// Recipes with meal history are archived rather than deleted, so the
// "least recently cooked" rotation keeps its data. Either way the recipe
// leaves the schedule.
export async function deleteOrArchiveRecipe(recipeId: number) {
  await db.transaction(async (tx) => {
    await tx.delete(mealSchedule).where(eq(mealSchedule.recipeId, recipeId)).run();
    if (await tx.select().from(mealHistory).where(eq(mealHistory.recipeId, recipeId)).limit(1).get()) {
      await tx.update(recipes).set({ archived: true }).where(eq(recipes.id, recipeId)).run();
    } else {
      await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId)).run();
      await tx.delete(shoppingListRecipes).where(eq(shoppingListRecipes.recipeId, recipeId)).run();
      await tx.delete(recipes).where(eq(recipes.id, recipeId)).run();
    }
  });
}

// Servings of a scheduled or listed meal, falling back to the recipe's serving size
export function mealServings(servings: typeof mealSchedule.servings | typeof shoppingListRecipes.servings) {
  return sql<number>`coalesce(${servings}, ${recipes.servingSize})`;
}

export async function restoreRecipe(recipeId: number) {
  await db.update(recipes).set({ archived: false }).where(eq(recipes.id, recipeId)).run();
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

// Creates a parsed recipe in one go. Ingredients are matched to items by name; missing
// items are created without a store or shelf, with the recipe's unit as their default.
// Returns the recipe id and the items it created.
export async function importRecipe({ ingredients, ...recipe }: ParsedRecipe & { servingSize: number }) {
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: items.id, name: items.name }).from(items).all();
    const idsByKey = new Map(existing.map((i) => [itemKey(i.name), i.id]));

    const newItems: { id: number; name: string }[] = [];
    for (const ing of ingredients) {
      if (idsByKey.has(itemKey(ing.name))) continue;
      const [item] = await tx
        .insert(items)
        .values({ name: ing.name, defaultUnit: ing.unit })
        .returning({ id: items.id, name: items.name });
      idsByKey.set(itemKey(item.name), item.id);
      newItems.push(item);
    }

    const [{ id }] = await tx.insert(recipes).values(recipe).returning({ id: recipes.id });
    await tx.insert(recipeIngredients).values(ingredients.map((ing) => ({
      recipeId: id,
      itemId: idsByKey.get(itemKey(ing.name))!,
      quantity: ing.quantity,
      unit: ing.unit,
    }))).run();

    return { id, newItems };
  });
}
