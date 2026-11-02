import "./test-db";
import { describe, expect, it } from "vitest";
import { db } from "./client";
import { deleteRecipePhoto, getRecipePhoto, recipePhotoUrl, setRecipePhoto } from "./recipe-photos.server";
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

    await setRecipePhoto(id, Buffer.from([1, 2, 3]));
    const firstUrl = await recipePhotoUrl(id);
    expect(firstUrl).toMatch(new RegExp(`^/recipes/${id}/photo\\?v=`));

    await new Promise((resolve) => setTimeout(resolve, 2));
    await setRecipePhoto(id, Buffer.from([4, 5]));
    expect([...(await getRecipePhoto(id))!.data]).toEqual([4, 5]);
    // A new URL, so the cached old photo isn't shown
    expect(await recipePhotoUrl(id)).not.toBe(firstUrl);

    await deleteRecipePhoto(id);
    expect(await getRecipePhoto(id)).toBeUndefined();
  });

  it("goes with the recipe when it's deleted", async () => {
    const id = await newRecipe("Lasagne");
    await setRecipePhoto(id, Buffer.from([1]));
    await deleteOrArchiveRecipe(id);
    expect(await getRecipePhoto(id)).toBeUndefined();
  });

  it("stays when the recipe is archived", async () => {
    const id = await newRecipe("Risotto");
    await setRecipePhoto(id, Buffer.from([1]));
    await db.insert(schema.mealHistory).values({ recipeId: id, cookedAt: "2026-11-01" }).run();
    await deleteOrArchiveRecipe(id);
    expect(await getRecipePhoto(id)).toBeDefined();
  });
});
