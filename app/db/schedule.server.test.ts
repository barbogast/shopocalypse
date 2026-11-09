import "./test-db";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "./client";
import { autoFill, reorderSchedule, scheduleRecipe } from "./schedule.server";
import * as schema from "./schema";
import { setRecipeTags } from "./tags.server";

const schedule = () => db.select().from(schema.mealSchedule).orderBy(asc(schema.mealSchedule.position));

describe("autoFill", () => {
  it("says so when no recipe is in auto-fill", async () => {
    await db.insert(schema.recipes).values({ name: "Occasional", servingSize: 2, autoFill: false }).run();
    expect(await autoFill(3, null)).toEqual({ error: "Kein Rezept ist für das automatische Auffüllen vorgesehen." });
  });

  it("goes round the rotation, after what's already scheduled", async () => {
    const [a, b] = await db.insert(schema.recipes).values([{ name: "A", servingSize: 2 }, { name: "B", servingSize: 2 }]).returning();
    await scheduleRecipe(a.id, null);
    expect(await autoFill(3, 4)).toEqual({ error: null });
    expect((await schedule()).map((m) => [m.position, m.recipeId, m.servings])).toEqual([
      [1, a.id, null],
      [2, b.id, 4],
      [3, a.id, 4],
      [4, b.id, 4],
    ]);
  });
});

describe("autoFill with a tag", () => {
  it("only picks recipes carrying it", async () => {
    await db.delete(schema.mealSchedule);
    const [fish, veg] = await db.insert(schema.recipes).values([{ name: "Fisch", servingSize: 2 }, { name: "Gemüse", servingSize: 2 }]).returning();
    await setRecipeTags(fish.id, ["Fisch"]);
    await setRecipeTags(veg.id, ["Vegetarisch"]);
    const [tag] = await db.select().from(schema.tags).where(eq(schema.tags.name, "Fisch"));
    expect(await autoFill(2, null, tag.id)).toEqual({ error: null });
    expect((await schedule()).map((m) => m.recipeId)).toEqual([fish.id, fish.id]);
  });

  it("says so when no auto-fill recipe carries it", async () => {
    const [r] = await db.insert(schema.recipes).values({ name: "Selten", servingSize: 2, autoFill: false }).returning();
    await setRecipeTags(r.id, ["Festtag"]);
    const [tag] = await db.select().from(schema.tags).where(eq(schema.tags.name, "Festtag"));
    expect(await autoFill(1, null, tag.id)).toEqual({ error: "Kein Rezept mit diesem Tag ist für das automatische Auffüllen vorgesehen." });
  });
});

describe("scheduleRecipe", () => {
  it("won't add an archived recipe", async () => {
    const [r] = await db.insert(schema.recipes).values({ name: "Archived", servingSize: 2, archived: true }).returning();
    expect(await scheduleRecipe(r.id, null)).toEqual({ error: "Dieses Rezept gibt es nicht mehr." });
  });
});

describe("reorderSchedule", () => {
  // Earlier tests leave meals on the schedule; positions continue after theirs
  async function scheduleThree() {
    await db.delete(schema.mealSchedule);
    const recipes = await db.insert(schema.recipes).values([{ name: "A", servingSize: 2 }, { name: "B", servingSize: 2 }, { name: "C", servingSize: 2 }]).returning();
    await scheduleRecipe(recipes[0].id, 3);
    await scheduleRecipe(recipes[1].id, null);
    await scheduleRecipe(recipes[2].id, 5);
    return [recipes.map((r) => r.id), (await schedule()).map((m) => m.position)] as const;
  }

  it("moves the meals with their servings, keeping the positions", async () => {
    const [[a, b, c], [p1, p2, p3]] = await scheduleThree();
    await reorderSchedule([p3, p1, p2]);
    expect((await schedule()).map((m) => [m.position, m.recipeId, m.servings])).toEqual([
      [p1, c, 5],
      [p2, a, 3],
      [p3, b, null],
    ]);
  });

  it("ignores an order made before the schedule changed", async () => {
    const [[a, b, c], [p1, p2, p3]] = await scheduleThree();
    await reorderSchedule([p2, p1]);
    await reorderSchedule([p3 + 1, p3, p2, p1]);
    expect((await schedule()).map((m) => m.recipeId)).toEqual([a, b, c]);
  });
});
