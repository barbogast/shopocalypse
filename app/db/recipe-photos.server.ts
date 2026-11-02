import { eq } from "drizzle-orm";
import { db } from "./client";
import * as schema from "./schema";

// Resized in the browser to about 300 KB; anything far bigger didn't come from the photo button
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

// Adds the recipe's photo or replaces it
export async function setRecipePhoto(recipeId: number, data: Buffer) {
  const updatedAt = new Date().toISOString();
  await db
    .insert(schema.recipePhotos)
    .values({ recipeId, data, updatedAt })
    .onConflictDoUpdate({ target: schema.recipePhotos.recipeId, set: { data, updatedAt } })
    .run();
}

export async function deleteRecipePhoto(recipeId: number) {
  await db.delete(schema.recipePhotos).where(eq(schema.recipePhotos.recipeId, recipeId)).run();
}

export async function getRecipePhoto(recipeId: number) {
  return db.select().from(schema.recipePhotos).where(eq(schema.recipePhotos.recipeId, recipeId)).get();
}

// The photo's URL, or null without one; changes with each upload, so it can be cached for good
export async function recipePhotoUrl(recipeId: number) {
  const row = await db
    .select({ updatedAt: schema.recipePhotos.updatedAt })
    .from(schema.recipePhotos)
    .where(eq(schema.recipePhotos.recipeId, recipeId))
    .get();
  return row ? `/recipes/${recipeId}/photo?v=${encodeURIComponent(row.updatedAt)}` : null;
}
