import { describe, expect, it } from "vitest";
import { itemKey, parseIngredient, parseRecipeText } from "./recipe-import";

describe("parseIngredient", () => {
  it("reads quantity, unit and name", () => {
    expect(parseIngredient("400 g spaghetti")).toEqual({ name: "spaghetti", quantity: 400, unit: "g" });
    expect(parseIngredient("400g spaghetti")).toEqual({ name: "spaghetti", quantity: 400, unit: "g" });
    expect(parseIngredient("2 tablespoons olive oil")).toEqual({ name: "olive oil", quantity: 2, unit: "tbsp" });
    expect(parseIngredient("1 Tbsp. sugar")).toEqual({ name: "sugar", quantity: 1, unit: "tbsp" });
    expect(parseIngredient("3 cans tomatoes")).toEqual({ name: "tomatoes", quantity: 3, unit: "can" });
  });

  it("treats a number without a unit as pieces", () => {
    expect(parseIngredient("2 eggs")).toEqual({ name: "eggs", quantity: 2, unit: "pcs" });
  });

  it("reads lines without a quantity", () => {
    expect(parseIngredient("salt")).toEqual({ name: "salt", quantity: null, unit: null });
  });

  it("reads decimals with a point or comma, and fractions", () => {
    expect(parseIngredient("1.5 kg potatoes")).toMatchObject({ quantity: 1.5, unit: "kg" });
    expect(parseIngredient("1,5 l milk")).toMatchObject({ quantity: 1.5, unit: "l" });
    expect(parseIngredient("1/2 tsp cumin")).toMatchObject({ quantity: 0.5, unit: "tsp" });
    expect(parseIngredient("1 1/2 tsp cumin")).toMatchObject({ quantity: 1.5, unit: "tsp" });
    expect(parseIngredient("½ lemon")).toEqual({ name: "lemon", quantity: 0.5, unit: "pcs" });
    expect(parseIngredient("1½ tsp salt")).toMatchObject({ quantity: 1.5, unit: "tsp" });
    expect(parseIngredient("1 ½ tsp salt")).toMatchObject({ quantity: 1.5, unit: "tsp" });
  });

  it("strips list bullets and extra spaces", () => {
    expect(parseIngredient("- 2  pcs   red onions")).toEqual({ name: "red onions", quantity: 2, unit: "pcs" });
    expect(parseIngredient("* salt")).toEqual({ name: "salt", quantity: null, unit: null });
  });

  it("rejects ranges, zero quantities and missing names", () => {
    expect(parseIngredient("2-3 eggs")).toHaveProperty("error");
    expect(parseIngredient("0 g butter")).toHaveProperty("error");
    expect(parseIngredient("200 g")).toHaveProperty("error");
  });
});

describe("itemKey", () => {
  it("ignores case and spacing", () => {
    expect(itemKey("  Olive   Oil ")).toBe(itemKey("olive oil"));
  });
});

const CARBONARA = `Spaghetti Carbonara
Serves 4

Ingredients
400 g spaghetti
4 eggs
salt

Instructions
Boil the pasta.

**Quickly** mix in the eggs.

Comments
From Nonna`;

describe("parseRecipeText", () => {
  it("parses a complete recipe", () => {
    const { recipe, errors } = parseRecipeText(CARBONARA);
    expect(errors).toEqual([]);
    expect(recipe).toEqual({
      name: "Spaghetti Carbonara",
      servingSize: 4,
      ingredients: [
        { line: 5, name: "spaghetti", quantity: 400, unit: "g" },
        { line: 6, name: "eggs", quantity: 4, unit: "pcs" },
        { line: 7, name: "salt", quantity: null, unit: null },
      ],
      instructions: "Boil the pasta.\n\n**Quickly** mix in the eggs.",
      comments: "From Nonna",
    });
  });

  it("accepts markdown headings, colons and any heading case", () => {
    const { recipe, errors } = parseRecipeText("# Soup\nserves 2\n## INGREDIENTS:\nwater");
    expect(errors).toEqual([]);
    expect(recipe).toMatchObject({ name: "Soup", servingSize: 2, instructions: null, comments: null });
  });

  it("reports errors with their line numbers", () => {
    const { errors } = parseRecipeText("Soup\nServes four\nfor a cold day\nIngredients\n2-3 carrots\n1 carrot\n1 Carrot");
    expect(errors).toEqual([
      { line: 2, message: expect.stringContaining("whole number") },
      { line: 3, message: expect.stringContaining("Serves") },
      { line: 5, message: expect.stringContaining("Ranges") },
      { line: 7, message: expect.stringContaining("line 6") },
    ]);
  });

  it("reports missing parts", () => {
    expect(parseRecipeText("").errors.map((e) => e.message)).toEqual([
      expect.stringContaining("recipe name"),
      expect.stringContaining("Ingredients"),
    ]);
    expect(parseRecipeText("Soup\nIngredients\n\nInstructions\nCook.").errors.map((e) => e.message)).toEqual([
      expect.stringContaining("Serves"),
      expect.stringContaining("at least one ingredient"),
    ]);
  });

  it("reports a section that appears twice", () => {
    const { errors } = parseRecipeText("Soup\nServes 2\nIngredients\nwater\nIngredients\nsalt");
    expect(errors).toEqual([{ line: 5, message: expect.stringContaining("twice") }]);
  });
});
