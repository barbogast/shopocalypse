import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
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
          note: recipeIngredients.note,
        })
        .from(recipeIngredients)
        .innerJoin(items, eq(recipeIngredients.itemId, items.id))
        .where(inArray(recipeIngredients.recipeId, meals.map((m) => m.id)))
        .orderBy(asc(recipeIngredients.position))
    : [];
  return meals.map((m) => ({
    ...m,
    ingredients: rows
      .filter((i) => i.recipeId === m.id)
      .map((i) => ({ ...i, ...scaleAmount(i, m.servings, m.servingSize) })),
  }));
}

// Adds an ingredient at the end of the recipe, or edits it in place if it's already there
export async function upsertIngredient(
  recipeId: number,
  itemId: number,
  { quantity, unit, note }: Pick<typeof recipeIngredients.$inferInsert, "quantity" | "unit" | "note">,
) {
  const last = sql<number>`(select coalesce(max(${recipeIngredients.position}), 0) + 1 from ${recipeIngredients} where ${recipeIngredients.recipeId} = ${recipeId})`;
  await db
    .insert(recipeIngredients)
    .values({ recipeId, itemId, quantity, unit, note, position: last })
    .onConflictDoUpdate({ target: [recipeIngredients.recipeId, recipeIngredients.itemId], set: { quantity, unit, note } })
    .run();
}

// Swap positions with the neighbouring ingredient in the same recipe
export async function moveIngredient(recipeId: number, itemId: number, up: boolean) {
  await db.transaction(async (tx) => {
    const ofItem = (id: number) => and(eq(recipeIngredients.recipeId, recipeId), eq(recipeIngredients.itemId, id));
    const current = await tx.select().from(recipeIngredients).where(ofItem(itemId)).get();
    if (!current) return;
    const neighbour = await tx
      .select()
      .from(recipeIngredients)
      .where(and(
        eq(recipeIngredients.recipeId, recipeId),
        up ? lt(recipeIngredients.position, current.position) : gt(recipeIngredients.position, current.position),
      ))
      .orderBy(up ? desc(recipeIngredients.position) : asc(recipeIngredients.position))
      .limit(1)
      .get();
    if (!neighbour) return;
    await tx.update(recipeIngredients).set({ position: neighbour.position }).where(ofItem(current.itemId)).run();
    await tx.update(recipeIngredients).set({ position: current.position }).where(ofItem(neighbour.itemId)).run();
  });
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
    await tx.insert(recipeIngredients).values(ingredients.map((ing, index) => ({
      recipeId: id,
      position: index + 1,
      itemId: idsByKey.get(itemKey(ing.name))!,
      quantity: ing.quantity,
      unit: ing.unit,
      note: ing.note,
    }))).run();

    return { id, newItems };
  });
}
