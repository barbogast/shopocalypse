import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { itemKey, itemKeys } from "~/item-names";
import { type ParsedIngredient, type ParsedRecipe } from "~/recipe-import";
import { scaleAmount, type UnitKey } from "~/units";
import { db } from "./client";
import { recordRecipeVersion } from "./recipe-versions";
import type { Tx } from "./shopping.server";
import * as schema from "./schema";

// Cook dates are stored as YYYY-MM-DD; format on the server so client and server render the same string
export function formatCookedAt(cookedAt: string) {
  return new Date(`${cookedAt}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

// Recipes with meal history are archived rather than deleted, so the
// "least recently cooked" rotation keeps its data. So are recipes on a
// shopping list: the list keeps the meal, and removing it there still takes
// its items off. Either way the recipe leaves the schedule.
export async function deleteOrArchiveRecipe(recipeId: number) {
  await db.transaction(async (tx) => {
    await tx.delete(schema.mealSchedule).where(eq(schema.mealSchedule.recipeId, recipeId)).run();
    const cooked = await tx.select().from(schema.mealHistory).where(eq(schema.mealHistory.recipeId, recipeId)).limit(1).get();
    const listed = await tx.select().from(schema.shoppingListRecipes).where(eq(schema.shoppingListRecipes.recipeId, recipeId)).limit(1).get();
    if (cooked || listed) {
      await tx.update(schema.recipes).set({ archived: true }).where(eq(schema.recipes.id, recipeId)).run();
    } else {
      await tx.delete(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, recipeId)).run();
      await tx.delete(schema.recipeVersions).where(eq(schema.recipeVersions.recipeId, recipeId)).run();
      await tx.delete(schema.recipes).where(eq(schema.recipes.id, recipeId)).run();
    }
  });
}

// Servings of a scheduled or listed meal, falling back to the recipe's serving size
export function mealServings(servings: typeof schema.mealSchedule.servings | typeof schema.shoppingListRecipes.servings) {
  return sql<number>`coalesce(${servings}, ${schema.recipes.servingSize})`;
}

export async function restoreRecipe(recipeId: number) {
  await db.update(schema.recipes).set({ archived: false }).where(eq(schema.recipes.id, recipeId)).run();
}

// Attach each meal's ingredients, scaled to its servings
export async function withIngredients<T extends { id: number; servings: number; servingSize: number }>(meals: T[]) {
  const rows = meals.length
    ? await db
        .select({
          recipeId: schema.recipeIngredients.recipeId,
          itemId: schema.recipeIngredients.itemId,
          name: schema.items.name,
          plural: schema.items.plural,
          quantity: schema.recipeIngredients.quantity,
          unit: schema.recipeIngredients.unit,
          note: schema.recipeIngredients.note,
          noteOnList: schema.recipeIngredients.noteOnList,
        })
        .from(schema.recipeIngredients)
        .innerJoin(schema.items, eq(schema.recipeIngredients.itemId, schema.items.id))
        .where(inArray(schema.recipeIngredients.recipeId, meals.map((m) => m.id)))
        .orderBy(asc(schema.recipeIngredients.position))
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
  { quantity, unit, note, noteOnList }: Pick<typeof schema.recipeIngredients.$inferInsert, "quantity" | "unit" | "note" | "noteOnList">,
) {
  const last = sql<number>`(select coalesce(max(${schema.recipeIngredients.position}), 0) + 1 from ${schema.recipeIngredients} where ${schema.recipeIngredients.recipeId} = ${recipeId})`;
  await db
    .insert(schema.recipeIngredients)
    .values({ recipeId, itemId, quantity, unit, note, noteOnList, position: last })
    .onConflictDoUpdate({ target: [schema.recipeIngredients.recipeId, schema.recipeIngredients.itemId], set: { quantity, unit, note, noteOnList } })
    .run();
}

// Swap positions with the neighbouring ingredient in the same recipe
export async function moveIngredient(recipeId: number, itemId: number, up: boolean) {
  await db.transaction(async (tx) => {
    const ofItem = (id: number) => and(eq(schema.recipeIngredients.recipeId, recipeId), eq(schema.recipeIngredients.itemId, id));
    const current = await tx.select().from(schema.recipeIngredients).where(ofItem(itemId)).get();
    if (!current) return;
    const neighbour = await tx
      .select()
      .from(schema.recipeIngredients)
      .where(and(
        eq(schema.recipeIngredients.recipeId, recipeId),
        up ? lt(schema.recipeIngredients.position, current.position) : gt(schema.recipeIngredients.position, current.position),
      ))
      .orderBy(up ? desc(schema.recipeIngredients.position) : asc(schema.recipeIngredients.position))
      .limit(1)
      .get();
    if (!neighbour) return;
    await tx.update(schema.recipeIngredients).set({ position: neighbour.position }).where(ofItem(current.itemId)).run();
    await tx.update(schema.recipeIngredients).set({ position: current.position }).where(ofItem(neighbour.itemId)).run();
  });
}

const IMPORT_STORE_NAME = "Supermarkt";

// The item ids for parsed ingredient names, matched by name or plural; missing items are created in the
// "Supermarkt" store (if there is one) without a shelf, with the ingredient's unit as their default.
// Returns the ids by itemKey, the items it created and the store they were put in.
export async function findOrCreateItems(tx: Tx, ingredients: Pick<ParsedIngredient, "name" | "unit">[]) {
  const existing = await tx.select({ id: schema.items.id, name: schema.items.name, plural: schema.items.plural }).from(schema.items).all();
  const idsByKey = new Map(existing.flatMap((i) => itemKeys(i).map((key) => [key, i.id] as const)));

  const store = await tx.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores)
    .where(eq(schema.stores.name, IMPORT_STORE_NAME)).orderBy(asc(schema.stores.id)).get();

  const newItems: { id: number; name: string; storeId: number | null; defaultUnit: UnitKey | null }[] = [];
  for (const ing of ingredients) {
    if (idsByKey.has(itemKey(ing.name))) continue;
    const [item] = await tx
      .insert(schema.items)
      .values({ name: ing.name, storeId: store?.id ?? null, defaultUnit: ing.unit })
      .returning({ id: schema.items.id, name: schema.items.name, storeId: schema.items.storeId, defaultUnit: schema.items.defaultUnit });
    idsByKey.set(itemKey(item.name), item.id);
    newItems.push(item);
  }
  return { idsByKey, newItems, storeName: store?.name ?? null };
}

// Creates a parsed recipe in one go, with the notes ticked to go on the shopping list. Ingredients are
// matched to items, or new ones created, by findOrCreateItems.
// Returns the recipe id, the items it created and the store they were put in.
export async function importRecipe({ ingredients, ...recipe }: Omit<ParsedRecipe, "ingredients"> & {
  servingSize: number;
  ingredients: (ParsedIngredient & { noteOnList: boolean })[];
}) {
  return db.transaction(async (tx) => {
    const { idsByKey, newItems, storeName } = await findOrCreateItems(tx, ingredients);

    const [{ id }] = await tx.insert(schema.recipes).values(recipe).returning({ id: schema.recipes.id });
    await tx.insert(schema.recipeIngredients).values(ingredients.map((ing, index) => ({
      recipeId: id,
      position: index + 1,
      itemId: idsByKey.get(itemKey(ing.name))!,
      quantity: ing.quantity,
      unit: ing.unit,
      note: ing.note,
      noteOnList: ing.noteOnList,
    }))).run();
    await recordRecipeVersion(tx, id);

    return { id, newItems, storeName };
  });
}
