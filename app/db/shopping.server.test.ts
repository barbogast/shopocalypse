import "./test-db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./client";
import { deleteStore } from "./items.server";
import { importRecipe } from "./recipes.server";
import * as schema from "./schema";
import {
  addItemToList,
  addMeal,
  addOneOffToList,
  discardList,
  finishList,
  getActiveList,
  listItemsInOrder,
  listMealsWithRecipes,
  prepareList,
  removeMeal,
  setBought,
} from "./shopping.server";

// Only one list can be active, so each test starts without one
beforeEach(async () => {
  const active = await getActiveList();
  if (active) await discardList(active.id);
});

let recipeCount = 0;
// A recipe for 2 needing 200 g of `item`, scheduled at the next position
async function scheduleRecipe(item: string) {
  const { id } = await importRecipe({
    name: `Recipe ${++recipeCount}`, servingSize: 2, weblink: null, instructions: null, comments: null,
    ingredients: [{ line: 4, name: item, quantity: 200, unit: "g", note: null, noteOnList: false }],
  });
  await db.insert(schema.mealSchedule).values({ position: recipeCount, recipeId: id }).run();
  return { recipeId: id, position: recipeCount };
}

const itemId = async (name: string) => (await db.select().from(schema.items).where(eq(schema.items.name, name)).get())!.id;

async function activeList() {
  const list = await getActiveList();
  if (!list) throw new Error("No active list");
  return list;
}

describe("prepareList", () => {
  it("lists what the picked meals need", async () => {
    const soup = await scheduleRecipe("Linsen");
    await scheduleRecipe("Reis");
    await prepareList([soup.position], false);
    const list = await activeList();
    expect(await listItemsInOrder(list.id)).toMatchObject([{ itemName: "Linsen", amounts: [{ quantity: 200, unit: "g" }] }]);
    expect(await listMealsWithRecipes(list.id)).toMatchObject([{ id: soup.recipeId, count: 1 }]);
  });

  it("doesn't start a second list", async () => {
    await prepareList([], false);
    const first = await activeList();
    await prepareList([], false);
    expect((await activeList()).id).toBe(first.id);
  });
});

describe("addItemToList", () => {
  it("adds up the amounts of an item already on the list, which needs buying again", async () => {
    await scheduleRecipe("Mehl");
    await prepareList([], false);
    const list = await activeList();
    const mehl = await itemId("Mehl");
    await addItemToList(list.id, mehl, { quantity: 500, unit: "g" });
    const [row] = await listItemsInOrder(list.id);
    await setBought(row.id, true);
    await addItemToList(list.id, mehl, { quantity: 1, unit: "kg" });
    expect(await listItemsInOrder(list.id)).toMatchObject([{ amounts: [{ quantity: 1.5, unit: "kg" }], bought: false, source: "manual" }]);
  });
});

describe("addOneOffToList", () => {
  const none = { quantity: null, unit: null };

  it("lists a name that isn't an item, under its store and shelf", async () => {
    await prepareList([], false);
    const list = await activeList();
    const store = await db.insert(schema.stores).values({ name: "Drogerie" }).returning().get();
    const shelf = await db.insert(schema.itemCategories).values({ name: "Haushalt", storeId: store.id }).returning().get();
    const before = await db.$count(schema.items);
    expect(await addOneOffToList(list.id, { name: "Batterien", storeId: store.id, categoryId: shelf.id, amount: { quantity: 4, unit: "pcs" } }))
      .toEqual({ error: null });
    expect(await listItemsInOrder(list.id)).toMatchObject([
      { itemId: null, itemName: "Batterien", storeName: "Drogerie", shelfName: "Haushalt", amounts: [{ quantity: 4, unit: "pcs" }], source: "manual" },
    ]);
    expect(await db.$count(schema.items)).toBe(before);

    // Deleting the store keeps the entry, without a store
    await deleteStore(store.id);
    expect(await listItemsInOrder(list.id)).toMatchObject([{ itemName: "Batterien", storeName: null, shelfName: null }]);
  });

  it("adds up a one-off with the same name, which needs buying again", async () => {
    await prepareList([], false);
    const list = await activeList();
    await addOneOffToList(list.id, { name: "Servietten", storeId: null, categoryId: null, amount: { quantity: 1, unit: "pack" } });
    const [row] = await listItemsInOrder(list.id);
    await setBought(row.id, true);
    await addOneOffToList(list.id, { name: "servietten", storeId: null, categoryId: null, amount: { quantity: 2, unit: "pack" } });
    expect(await listItemsInOrder(list.id)).toMatchObject([{ id: row.id, amounts: [{ quantity: 3, unit: "pack" }], bought: false }]);
  });

  it("refuses a shelf from another store", async () => {
    await prepareList([], false);
    const list = await activeList();
    const [a, b] = await db.insert(schema.stores).values([{ name: "A" }, { name: "B" }]).returning();
    const shelf = await db.insert(schema.itemCategories).values({ name: "Regal", storeId: b.id }).returning().get();
    expect(await addOneOffToList(list.id, { name: "Kerzen", storeId: a.id, categoryId: shelf.id, amount: none }))
      .toEqual({ error: "Dieses Regal gehört nicht zum gewählten Laden." });
    expect(await listItemsInOrder(list.id)).toEqual([]);
  });

  it("is left alone when meals are added or removed", async () => {
    const { recipeId } = await scheduleRecipe("Polenta");
    await prepareList([], false);
    const list = await activeList();
    await addOneOffToList(list.id, { name: "Geschenkpapier", storeId: null, categoryId: null, amount: none });
    await addMeal(list, recipeId, null);
    const [meal] = await listMealsWithRecipes(list.id);
    await removeMeal(list, meal.listRecipeId);
    expect(await listItemsInOrder(list.id)).toMatchObject([{ itemName: "Geschenkpapier" }]);
  });
});

describe("addMeal and removeMeal", () => {
  it("add and take off what a meal needs", async () => {
    const { recipeId } = await scheduleRecipe("Bulgur");
    await prepareList([], false);
    const list = await activeList();
    expect(await addMeal(list, recipeId, 4)).toEqual({ error: null });
    expect(await listItemsInOrder(list.id)).toMatchObject([{ itemName: "Bulgur", amounts: [{ quantity: 400, unit: "g" }] }]);
    const [meal] = await listMealsWithRecipes(list.id);
    await removeMeal(list, meal.listRecipeId);
    expect(await listItemsInOrder(list.id)).toEqual([]);
  });

  it("won't add an archived recipe", async () => {
    const { recipeId } = await scheduleRecipe("Hirse");
    await db.update(schema.recipes).set({ archived: true }).where(eq(schema.recipes.id, recipeId)).run();
    await prepareList([], false);
    expect(await addMeal(await activeList(), recipeId, null)).toEqual({ error: "Dieses Rezept gibt es nicht mehr." });
  });
});

describe("setBought", () => {
  it("leaves rows of a finished list alone", async () => {
    const { position } = await scheduleRecipe("Quinoa");
    await prepareList([position], false);
    const list = await activeList();
    const [row] = await listItemsInOrder(list.id);
    await finishList(list.id);
    await setBought(row.id, true);
    expect(await listItemsInOrder(list.id)).toMatchObject([{ bought: false }]);
  });
});
