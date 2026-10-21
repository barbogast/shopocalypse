// Relative imports with extensions, so scripts/ can load this file with plain Node
import { asc, desc, eq, inArray, notExists } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { recipeToText } from "../recipe-import.ts";
import * as schema from "./schema.ts";

// The app's db, a transaction, or a script's own connection
type Db = BaseSQLiteDatabase<"async", any, typeof schema>;

// Edits within this long of the latest version are folded into it, so one editing session makes one version
const SESSION_MS = 30 * 60 * 1000;

// Each recipe's ingredients in recipe order, for writing the recipes out
async function ingredientsOf(db: Db, recipeIds: number[]) {
  return db
    .select({
      recipeId: schema.recipeIngredients.recipeId,
      name: schema.items.name,
      plural: schema.items.plural,
      quantity: schema.recipeIngredients.quantity,
      unit: schema.recipeIngredients.unit,
      note: schema.recipeIngredients.note,
    })
    .from(schema.recipeIngredients)
    .innerJoin(schema.items, eq(schema.recipeIngredients.itemId, schema.items.id))
    .where(inArray(schema.recipeIngredients.recipeId, recipeIds))
    .orderBy(asc(schema.recipeIngredients.position))
    .all();
}

// Call after changing a recipe's name, servings, weblink, ingredients, instructions or comments
export async function recordRecipeVersion(db: Db, recipeId: number, now = new Date()) {
  const recipe = await db.select().from(schema.recipes).where(eq(schema.recipes.id, recipeId)).get();
  if (!recipe) return;
  const text = recipeToText({ ...recipe, ingredients: await ingredientsOf(db, [recipeId]) });

  const [latest, previous] = await db
    .select()
    .from(schema.recipeVersions)
    .where(eq(schema.recipeVersions.recipeId, recipeId))
    .orderBy(desc(schema.recipeVersions.savedAt), desc(schema.recipeVersions.id))
    .limit(2)
    .all();
  if (latest?.text === text) return;

  const savedAt = now.toISOString();
  if (!latest || now.getTime() - Date.parse(latest.savedAt) >= SESSION_MS) {
    await db.insert(schema.recipeVersions).values({ recipeId, savedAt, text }).run();
  } else if (previous?.text === text) {
    // The session's edits were undone: nothing changed since the version before
    await db.delete(schema.recipeVersions).where(eq(schema.recipeVersions.id, latest.id)).run();
  } else {
    await db.update(schema.recipeVersions).set({ text, savedAt }).where(eq(schema.recipeVersions.id, latest.id)).run();
  }
}

// Gives recipes from before versions were kept a first version, dated when the recipe was added.
// Returns how many it added; none once every recipe has a version
export async function backfillRecipeVersions(db: Db) {
  const missing = await db
    .select()
    .from(schema.recipes)
    .where(notExists(db.select().from(schema.recipeVersions).where(eq(schema.recipeVersions.recipeId, schema.recipes.id))))
    .all();
  if (!missing.length) return 0;

  const ingredients = await ingredientsOf(db, missing.map((r) => r.id));
  await db.insert(schema.recipeVersions).values(missing.map((recipe) => ({
    recipeId: recipe.id,
    savedAt: recipe.createdAt,
    text: recipeToText({ ...recipe, ingredients: ingredients.filter((i) => i.recipeId === recipe.id) }),
  }))).run();
  return missing.length;
}
