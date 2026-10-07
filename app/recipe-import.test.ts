import { describe, expect, it } from "vitest";
import { itemKey, parseIngredient, parseRecipeText } from "./recipe-import";

describe("parseIngredient", () => {
  it("reads quantity, unit and name", () => {
    expect(parseIngredient("400 g spaghetti")).toEqual({ name: "spaghetti", quantity: 400, unit: "g", note: null });
    expect(parseIngredient("400g spaghetti")).toEqual({ name: "spaghetti", quantity: 400, unit: "g", note: null });
    expect(parseIngredient("2 tablespoons olive oil")).toEqual({ name: "olive oil", quantity: 2, unit: "tbsp", note: null });
    expect(parseIngredient("1 Tbsp. sugar")).toEqual({ name: "sugar", quantity: 1, unit: "tbsp", note: null });
    expect(parseIngredient("3 cans tomatoes")).toEqual({ name: "tomatoes", quantity: 3, unit: "can", note: null });
  });

  it("reads German units", () => {
    expect(parseIngredient("2 EL Olivenöl")).toEqual({ name: "Olivenöl", quantity: 2, unit: "tbsp", note: null });
    expect(parseIngredient("3 Stk. Zwiebeln")).toMatchObject({ name: "Zwiebeln", quantity: 3, unit: "pcs" });
    expect(parseIngredient("2 Gläser Kapern")).toMatchObject({ name: "Kapern", unit: "jar" });
    expect(parseIngredient("1 Prise Salz")).toMatchObject({ name: "Salz", unit: "pinch" });
    expect(parseIngredient("1 Bund Petersilie")).toMatchObject({ name: "Petersilie", unit: "bunch" });
  });

  it("treats a number without a unit as pieces", () => {
    expect(parseIngredient("2 eggs")).toEqual({ name: "eggs", quantity: 2, unit: "pcs", note: null });
  });

  it("reads lines without a quantity", () => {
    expect(parseIngredient("salt")).toEqual({ name: "salt", quantity: null, unit: null, note: null });
  });

  it("reads decimals with a point or comma, and fractions", () => {
    expect(parseIngredient("1.5 kg potatoes")).toMatchObject({ quantity: 1.5, unit: "kg" });
    expect(parseIngredient("1,5 l milk")).toMatchObject({ quantity: 1.5, unit: "l" });
    expect(parseIngredient("1/2 tsp cumin")).toMatchObject({ quantity: 0.5, unit: "tsp" });
    expect(parseIngredient("1 1/2 tsp cumin")).toMatchObject({ quantity: 1.5, unit: "tsp" });
    expect(parseIngredient("½ lemon")).toEqual({ name: "lemon", quantity: 0.5, unit: "pcs", note: null });
    expect(parseIngredient("1½ tsp salt")).toMatchObject({ quantity: 1.5, unit: "tsp" });
    expect(parseIngredient("1 ½ tsp salt")).toMatchObject({ quantity: 1.5, unit: "tsp" });
  });

  it("strips list bullets and extra spaces", () => {
    expect(parseIngredient("- 2  pcs   red onions")).toEqual({ name: "red onions", quantity: 2, unit: "pcs", note: null });
    expect(parseIngredient("* salt")).toEqual({ name: "salt", quantity: null, unit: null, note: null });
  });

  it("splits off a note after a spaced dash, a comma or in parentheses", () => {
    expect(parseIngredient("1 Knoblauchzehe - fein gewürfelt"))
      .toEqual({ name: "Knoblauchzehe", quantity: 1, unit: "pcs", note: "fein gewürfelt" });
    expect(parseIngredient("3 tbsp parsley – chopped; to serve"))
      .toEqual({ name: "parsley", quantity: 3, unit: "tbsp", note: "chopped; to serve" });
    expect(parseIngredient("2 onions, diced")).toMatchObject({ name: "onions", note: "diced" });
    expect(parseIngredient("200 g feta (or halloumi)")).toMatchObject({ name: "feta", note: "or halloumi" });
    expect(parseIngredient("1 can (400 g) tomatoes")).toMatchObject({ name: "tomatoes", unit: "can", note: "400 g" });
    expect(parseIngredient("salt - to taste")).toEqual({ name: "salt", quantity: null, unit: null, note: "to taste" });
  });

  it("keeps dashes within words and commas within parentheses", () => {
    expect(parseIngredient("1 tsp chili-flakes")).toMatchObject({ name: "chili-flakes", note: null });
    expect(parseIngredient("1,5 kg potatoes (waxy, small), peeled"))
      .toMatchObject({ name: "potatoes", quantity: 1.5, note: "waxy, small; peeled" });
    expect(parseIngredient("salt -")).toMatchObject({ name: "salt", note: null });
  });

  it("rejects ranges, zero quantities and missing names", () => {
    expect(parseIngredient("2-3 eggs")).toHaveProperty("error");
    expect(parseIngredient("0 g butter")).toHaveProperty("error");
    expect(parseIngredient("200 g")).toHaveProperty("error");
    expect(parseIngredient("200 g, chopped")).toHaveProperty("error");
    expect(parseIngredient("(optional)")).toHaveProperty("error");
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
        { line: 5, name: "spaghetti", quantity: 400, unit: "g", note: null },
        { line: 6, name: "eggs", quantity: 4, unit: "pcs", note: null },
        { line: 7, name: "salt", quantity: null, unit: null, note: null },
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
