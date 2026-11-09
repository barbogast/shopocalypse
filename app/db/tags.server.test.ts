import "./test-db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "./client";
import { deleteOrArchiveRecipe } from "./recipes.server";
import * as schema from "./schema";
import { allTags, copyRecipeTags, normalizeTagNames, setRecipeTags, tagsByRecipe } from "./tags.server";

const names = async (recipeId: number) => (await tagsByRecipe([recipeId])).get(recipeId)?.map((t) => t.name) ?? [];
const newRecipe = async (name = "R") => (await db.insert(schema.recipes).values({ name, servingSize: 2 }).returning())[0].id;

describe("normalizeTagNames", () => {
  it("trims, collapses spaces and drops empty and repeated names", () => {
    expect(normalizeTagNames([" Schnell ", "", "schnell", "Ohne   Fleisch", "Ä", "ä"])).toEqual(["Schnell", "Ohne Fleisch", "Ä"]);
  });
});

describe("setRecipeTags", () => {
  it("reuses tags differing only in case and deletes unused ones", async () => {
    await db.delete(schema.recipeTags);
    await db.delete(schema.tags);
    const a = await newRecipe("A");
    const b = await newRecipe("B");
    await setRecipeTags(a, ["Vegetarisch", "Schnell"]);
    await setRecipeTags(b, ["vegetarisch"]);
    expect(await names(b)).toEqual(["Vegetarisch"]);
    await setRecipeTags(a, ["Vegetarisch"]);
    expect((await allTags()).map((t) => t.name)).toEqual(["Vegetarisch"]);
  });
});

describe("tag colors", () => {
  it("gives new tags different colors", async () => {
    await db.delete(schema.recipeTags);
    await db.delete(schema.tags);
    await setRecipeTags(await newRecipe(), ["Eins", "Zwei", "Drei"]);
    expect((await allTags()).map((t) => [t.name, t.color])).toEqual([["Drei", "orange"], ["Eins", "blue"], ["Zwei", "green"]]);
  });
});

describe("copyRecipeTags", () => {
  it("gives a variant the original's tags", async () => {
    const original = await newRecipe();
    const variant = await newRecipe();
    await setRecipeTags(original, ["Fisch"]);
    await copyRecipeTags(original, variant);
    expect(await names(variant)).toEqual(["Fisch"]);
  });
});

describe("deleteOrArchiveRecipe", () => {
  it("drops a deleted recipe's tags, and the tag once nothing uses it", async () => {
    const r = await newRecipe();
    await setRecipeTags(r, ["Einmalig"]);
    await deleteOrArchiveRecipe(r);
    expect(await db.select().from(schema.tags).where(eq(schema.tags.name, "Einmalig"))).toEqual([]);
  });
});
