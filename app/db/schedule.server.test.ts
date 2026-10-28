import "./test-db";
import { asc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "./client";
import { autoFill, scheduleRecipe } from "./schedule.server";
import * as schema from "./schema";

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

describe("scheduleRecipe", () => {
  it("won't add an archived recipe", async () => {
    const [r] = await db.insert(schema.recipes).values({ name: "Archived", servingSize: 2, archived: true }).returning();
    expect(await scheduleRecipe(r.id, null)).toEqual({ error: "Dieses Rezept gibt es nicht mehr." });
  });
});
