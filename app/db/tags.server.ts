import { asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "./client";
import * as schema from "./schema";
import type { Tx } from "./shopping.server";
import { nextTagColor, type TagColor } from "~/tag-colors";

export type Tag = { id: number; name: string; color: TagColor };

// Trimmed, inner spaces collapsed, empty ones and case-insensitive repeats dropped (the first spelling wins)
export function normalizeTagNames(names: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ");
    const key = name.toLocaleLowerCase("de");
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

export function allTags() {
  return db.select().from(schema.tags).orderBy(sql`${schema.tags.name} collate nocase`);
}

// Each recipe's tags by name; recipes without tags are missing from the map
export async function tagsByRecipe(recipeIds?: number[]) {
  const rows = await db
    .select({ recipeId: schema.recipeTags.recipeId, id: schema.tags.id, name: schema.tags.name, color: schema.tags.color })
    .from(schema.recipeTags)
    .innerJoin(schema.tags, eq(schema.recipeTags.tagId, schema.tags.id))
    .where(recipeIds ? inArray(schema.recipeTags.recipeId, recipeIds) : undefined)
    .orderBy(sql`${schema.tags.name} collate nocase`);
  const byRecipe = new Map<number, Tag[]>();
  for (const { recipeId, ...tag } of rows) byRecipe.set(recipeId, [...byRecipe.get(recipeId) ?? [], tag]);
  return byRecipe;
}

// Tags no recipe uses any more, so the tag lists only offer ones in use
export async function deleteUnusedTags(tx: Tx) {
  const used = tx.selectDistinct({ id: schema.recipeTags.tagId }).from(schema.recipeTags);
  await tx.delete(schema.tags).where(notInArray(schema.tags.id, used)).run();
}

// Gives the recipe exactly these tags, reusing existing ones that differ only in case. New ones get
// the color fewest tags have
export async function setRecipeTags(recipeId: number, names: string[]) {
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(schema.tags);
    const byKey = new Map(existing.map((t) => [t.name.toLocaleLowerCase("de"), t.id]));
    const usedColors = existing.map((t) => t.color);
    const tagIds: number[] = [];
    for (const name of normalizeTagNames(names)) {
      let id = byKey.get(name.toLocaleLowerCase("de"));
      if (id === undefined) {
        const color = nextTagColor(usedColors);
        usedColors.push(color);
        [{ id }] = await tx.insert(schema.tags).values({ name, color }).returning({ id: schema.tags.id });
      }
      tagIds.push(id);
    }
    await tx.delete(schema.recipeTags).where(eq(schema.recipeTags.recipeId, recipeId)).run();
    if (tagIds.length) await tx.insert(schema.recipeTags).values(tagIds.map((tagId) => ({ recipeId, tagId }))).run();
    await deleteUnusedTags(tx);
  });
}

// For a variant saved as a new recipe: it starts with the original's tags
export async function copyRecipeTags(fromRecipeId: number, toRecipeId: number) {
  const rows = await db.select({ tagId: schema.recipeTags.tagId }).from(schema.recipeTags)
    .where(eq(schema.recipeTags.recipeId, fromRecipeId)).orderBy(asc(schema.recipeTags.tagId));
  if (rows.length) await db.insert(schema.recipeTags).values(rows.map(({ tagId }) => ({ recipeId: toRecipeId, tagId }))).onConflictDoNothing().run();
}

// Recipe ids carrying the tag
export function recipesWithTag(tagId: number) {
  return db.select({ id: schema.recipeTags.recipeId }).from(schema.recipeTags).where(eq(schema.recipeTags.tagId, tagId));
}
