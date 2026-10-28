import "./test-db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "./client";
import { mergeItem } from "./items.server";
import * as schema from "./schema";

async function createItem(values: typeof schema.items.$inferInsert) {
  const [item] = await db.insert(schema.items).values(values).returning();
  return item;
}

const getItem = (id: number) => db.select().from(schema.items).where(eq(schema.items.id, id)).get();

describe("mergeItem", () => {
  it("keeps a duplicate that looks like the plural as the kept item's plural", async () => {
    const keep = await createItem({ name: "Karotte" });
    const duplicate = await createItem({ name: "Karotten" });
    expect(await mergeItem(duplicate.id, keep.id)).toEqual({ error: null });
    expect(await getItem(keep.id)).toMatchObject({ name: "Karotte", plural: "Karotten" });
    expect(await getItem(duplicate.id)).toBeUndefined();
  });

  it("keeps the duplicate's plural over its name", async () => {
    const keep = await createItem({ name: "Paprika" });
    const duplicate = await createItem({ name: "Paprikas", plural: "Paprikaschoten" });
    await mergeItem(duplicate.id, keep.id);
    expect(await getItem(keep.id)).toMatchObject({ plural: "Paprikaschoten" });
  });

  it("doesn't take another name as the plural", async () => {
    const keep = await createItem({ name: "Möhre" });
    const duplicate = await createItem({ name: "Mohrrübe" });
    await mergeItem(duplicate.id, keep.id);
    expect(await getItem(keep.id)).toMatchObject({ plural: null });
  });

  it("moves the duplicate's recipe ingredients to the kept item", async () => {
    const keep = await createItem({ name: "Lauch" });
    const duplicate = await createItem({ name: "Porree" });
    const [recipe] = await db.insert(schema.recipes).values({ name: "Lauchsuppe", servingSize: 2 }).returning();
    await db.insert(schema.recipeIngredients).values({ recipeId: recipe.id, itemId: duplicate.id, quantity: 1, unit: "pcs" }).run();
    await mergeItem(duplicate.id, keep.id);
    const ingredients = await db.select().from(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, recipe.id));
    expect(ingredients).toMatchObject([{ itemId: keep.id, quantity: 1 }]);
  });
});
