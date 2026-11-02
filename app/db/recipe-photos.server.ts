import { eq } from "drizzle-orm";
import { db } from "./client";
import * as schema from "./schema";

// Resized in the browser to about 300 KB; anything far bigger didn't come from the photo button
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

// Adds the recipe's photo or replaces it
export async function setRecipePhoto(recipeId: number, data: Buffer, thumbnail: Buffer) {
  const updatedAt = new Date().toISOString();
  await db
    .insert(schema.recipePhotos)
    .values({ recipeId, data, thumbnail, updatedAt })
    .onConflictDoUpdate({ target: schema.recipePhotos.recipeId, set: { data, thumbnail, updatedAt } })
    .run();
}

export async function deleteRecipePhoto(recipeId: number) {
  await db.delete(schema.recipePhotos).where(eq(schema.recipePhotos.recipeId, recipeId)).run();
}

// The photo's JPEG, or its thumbnail (the photo itself for photos uploaded before thumbnails)
export async function getRecipePhoto(recipeId: number, size: "full" | "thumbnail" = "full") {
  const row = await db.select().from(schema.recipePhotos).where(eq(schema.recipePhotos.recipeId, recipeId)).get();
  if (!row) return undefined;
  return size === "thumbnail" ? row.thumbnail ?? row.data : row.data;
}

// The URL of a photo uploaded at updatedAt, or null without one (e.g. from a left join on recipe_photos).
// It changes with each upload, so it can be cached for good
export function photoUrl(recipeId: number, updatedAt: string | null, size: "full" | "thumbnail" = "full") {
  if (!updatedAt) return null;
  const query = new URLSearchParams({ v: updatedAt, ...(size === "thumbnail" ? { size } : {}) });
  return `/recipes/${recipeId}/photo?${query}`;
}

// The recipe's photo URL, or null without one
export async function recipePhotoUrl(recipeId: number) {
  const row = await db
    .select({ updatedAt: schema.recipePhotos.updatedAt })
    .from(schema.recipePhotos)
    .where(eq(schema.recipePhotos.recipeId, recipeId))
    .get();
  return photoUrl(recipeId, row?.updatedAt ?? null);
}
