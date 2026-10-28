import "./test-db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "./client";
import { deleteOrArchiveRecipe, importRecipe } from "./recipes.server";
import * as schema from "./schema";

const getRecipe = (id: number) => db.select().from(schema.recipes).where(eq(schema.recipes.id, id)).get();

async function importSoup(name: string) {
  const { id } = await importRecipe({
    name, servingSize: 2, weblink: null, instructions: null, comments: null,
    ingredients: [{ line: 4, name: `${name} Wasser`, quantity: 1, unit: "l", note: null, noteOnList: false }],
  });
  return id;
}

describe("importRecipe", () => {
  it("creates the recipe with its items and a first version", async () => {
    const id = await importSoup("Brühe");
    expect(await getRecipe(id)).toMatchObject({ name: "Brühe", servingSize: 2 });
    const ingredients = await db.select().from(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, id));
    expect(ingredients).toHaveLength(1);
    const versions = await db.select().from(schema.recipeVersions).where(eq(schema.recipeVersions.recipeId, id));
    expect(versions).toHaveLength(1);
  });
});

describe("deleteOrArchiveRecipe", () => {
  it("deletes a recipe that was never cooked or listed", async () => {
    const id = await importSoup("Gemüsesuppe");
    await deleteOrArchiveRecipe(id);
    expect(await getRecipe(id)).toBeUndefined();
  });

  it("archives a cooked recipe", async () => {
    const id = await importSoup("Kürbissuppe");
    await db.insert(schema.mealHistory).values({ recipeId: id, cookedAt: "2026-10-01" }).run();
    await deleteOrArchiveRecipe(id);
    expect(await getRecipe(id)).toMatchObject({ archived: true });
  });

  it("archives a recipe on a shopping list, which keeps the meal", async () => {
    const id = await importSoup("Linsensuppe");
    const [list] = await db.insert(schema.shoppingLists).values({ createdAt: "2026-10-01", status: "completed" }).returning();
    await db.insert(schema.shoppingListRecipes).values({ shoppingListId: list.id, recipeId: id }).run();
    await deleteOrArchiveRecipe(id);
    expect(await getRecipe(id)).toMatchObject({ archived: true });
    const meals = await db.select().from(schema.shoppingListRecipes).where(eq(schema.shoppingListRecipes.shoppingListId, list.id));
    expect(meals).toHaveLength(1);
  });
});
