import "./test-db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./client";
import { importRecipe } from "./recipes.server";
import * as schema from "./schema";
import {
  addItemToList,
  addMeal,
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
    expect(await addMeal(await activeList(), recipeId, null)).toEqual({ error: "That recipe is no longer available." });
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
