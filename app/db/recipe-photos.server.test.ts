import "./test-db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "./client";
import { deleteRecipePhoto, getRecipePhoto, photoUrl, recipePhotoUrl, setRecipePhoto } from "./recipe-photos.server";
import { deleteOrArchiveRecipe } from "./recipes.server";
import * as schema from "./schema";

async function newRecipe(name: string) {
  const [{ id }] = await db.insert(schema.recipes).values({ name, servingSize: 2 }).returning({ id: schema.recipes.id });
  return id;
}

describe("recipe photos", () => {
  it("adds, replaces and removes a recipe's photo", async () => {
    const id = await newRecipe("Pizza");
    expect(await recipePhotoUrl(id)).toBeNull();

    await setRecipePhoto(id, Buffer.from([1, 2, 3]), Buffer.from([9]));
    const firstUrl = await recipePhotoUrl(id);
    expect(firstUrl).toMatch(new RegExp(`^/recipes/${id}/photo\\?v=`));

    await new Promise((resolve) => setTimeout(resolve, 2));
    await setRecipePhoto(id, Buffer.from([4, 5]), Buffer.from([8]));
    expect([...(await getRecipePhoto(id))!]).toEqual([4, 5]);
    expect([...(await getRecipePhoto(id, "thumbnail"))!]).toEqual([8]);
    // A new URL, so the cached old photo isn't shown
    expect(await recipePhotoUrl(id)).not.toBe(firstUrl);

    await deleteRecipePhoto(id);
    expect(await getRecipePhoto(id)).toBeUndefined();
  });

  it("goes with the recipe when it's deleted", async () => {
    const id = await newRecipe("Lasagne");
    await setRecipePhoto(id, Buffer.from([1]), Buffer.from([2]));
    await deleteOrArchiveRecipe(id);
    expect(await getRecipePhoto(id)).toBeUndefined();
  });

  it("stays when the recipe is archived", async () => {
    const id = await newRecipe("Risotto");
    await setRecipePhoto(id, Buffer.from([1]), Buffer.from([2]));
    await db.insert(schema.mealHistory).values({ recipeId: id, cookedAt: "2026-11-01" }).run();
    await deleteOrArchiveRecipe(id);
    expect(await getRecipePhoto(id)).toBeDefined();
  });

  it("falls back to the photo for a thumbnail when it has none", async () => {
    const id = await newRecipe("Gulasch");
    await setRecipePhoto(id, Buffer.from([1, 2]), Buffer.from([3]));
    await db.update(schema.recipePhotos).set({ thumbnail: null }).where(eq(schema.recipePhotos.recipeId, id)).run();
    expect([...(await getRecipePhoto(id, "thumbnail"))!]).toEqual([1, 2]);
  });
});

describe("photoUrl", () => {
  it("links the upload time, and the thumbnail when asked", () => {
    expect(photoUrl(3, null)).toBeNull();
    expect(photoUrl(3, "2026-11-02T16:00:00.000Z")).toBe("/recipes/3/photo?v=2026-11-02T16%3A00%3A00.000Z");
    expect(photoUrl(3, "2026-11-02T16:00:00.000Z", "thumbnail")).toBe("/recipes/3/photo?v=2026-11-02T16%3A00%3A00.000Z&size=thumbnail");
  });
});
