import { describe, expect, it } from "vitest";
import {
  ingredientToText,
  parseIngredient,
  parseItemsText,
  parseRecipeText,
  type RecipeForText,
  recipeToText,
} from "./recipe-import";

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
    expect(parseIngredient("1 Msp. Muskat")).toMatchObject({ name: "Muskat", unit: "knifetip" });
    expect(parseIngredient("1 Messerspitze Muskat")).toMatchObject({ name: "Muskat", unit: "knifetip" });
    expect(parseIngredient("1 Handvoll Rucola")).toMatchObject({ name: "Rucola", unit: "handful" });
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

  it("keeps commas, dashes and parentheses inside quotes", () => {
    expect(parseIngredient('200 g "Tomaten, gehackt"'))
      .toEqual({ name: "Tomaten, gehackt", quantity: 200, unit: "g", note: null });
    expect(parseIngredient('200 g "Tomaten, gehackt", abgetropft'))
      .toMatchObject({ name: "Tomaten, gehackt", note: "abgetropft" });
    expect(parseIngredient("1 „Salz, grob“ - to taste")).toMatchObject({ name: "Salz, grob", note: "to taste" });
    expect(parseIngredient("“Salz - grob”")).toMatchObject({ name: "Salz - grob", note: null });
    expect(parseIngredient('"Salz, Pfeffer"')).toEqual({ name: "Salz, Pfeffer", quantity: null, unit: null, note: null });
    expect(parseIngredient('"Feta (mild)" (or halloumi)')).toMatchObject({ name: "Feta (mild)", note: "or halloumi" });
    expect(parseIngredient('2 "Dose Tomaten"')).toMatchObject({ name: "Dose Tomaten", unit: "pcs" });
  });

  it("rejects unclosed or partial quotes and empty quoted names", () => {
    expect(parseIngredient('"Salz, Pfeffer')).toEqual({ error: expect.stringContaining("schließende Anführungszeichen") });
    expect(parseIngredient('"Salz" Pfeffer')).toEqual({ error: expect.stringContaining("ganzen Namen") });
    expect(parseIngredient('200 g ""')).toHaveProperty("error");
    expect(parseIngredient('"", chopped')).toHaveProperty("error");
  });

  it("rejects ranges, zero quantities and missing names", () => {
    expect(parseIngredient("2-3 eggs")).toHaveProperty("error");
    expect(parseIngredient("0 g butter")).toHaveProperty("error");
    expect(parseIngredient("200 g")).toHaveProperty("error");
    expect(parseIngredient("200 g, chopped")).toHaveProperty("error");
    expect(parseIngredient("(optional)")).toHaveProperty("error");
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
      weblink: null,
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

  it("reads German headings, and English ones alike", () => {
    const { recipe, errors } = parseRecipeText("Suppe\nfür 2\nZutaten:\nWasser\n## Zubereitung\nKochen.\nAnmerkungen\nWärmt");
    expect(errors).toEqual([]);
    expect(recipe).toMatchObject({ servingSize: 2, instructions: "Kochen.", comments: "Wärmt" });
    expect(recipe.ingredients.map((i) => i.name)).toEqual(["Wasser"]);
    expect(parseRecipeText("Suppe\n2\nZutaten\nWasser\nIngredients\nSalz").errors)
      .toEqual([{ line: 5, message: expect.stringContaining("doppelt") }]);
  });

  it("reports errors with their line numbers", () => {
    const { errors } = parseRecipeText("Soup\nServes four\nfor a cold day\nIngredients\n2-3 carrots\n1 carrot\n1 Carrot");
    expect(errors).toEqual([
      { line: 2, message: expect.stringContaining("ganze Zahl") },
      { line: 3, message: expect.stringContaining("Portionen") },
      { line: 5, message: expect.stringContaining("Bereiche") },
      { line: 7, message: expect.stringContaining("Zeile 6") },
    ]);
  });

  it("reports ingredients that are the same existing item", () => {
    const { errors } = parseRecipeText("Soup\n2\n---\n1 Zwiebel\n2 Zwiebeln - in Ringen", [{ name: "Zwiebel", plural: "Zwiebeln" }]);
    expect(errors).toEqual([{ line: 5, message: expect.stringContaining("derselbe Artikel wie „Zwiebel“ in Zeile 4") }]);
  });

  it("reports missing parts", () => {
    expect(parseRecipeText("").errors.map((e) => e.message)).toEqual([
      expect.stringContaining("Name des Rezepts"),
      expect.stringContaining("Zutaten"),
    ]);
    expect(parseRecipeText("Soup\nIngredients\n\nInstructions\nCook.").errors.map((e) => e.message)).toEqual([
      expect.stringContaining("Portionen"),
      expect.stringContaining("Mindestens eine Zutat"),
    ]);
  });

  it("reports a section that appears twice", () => {
    const { errors } = parseRecipeText("Soup\nServes 2\nIngredients\nwater\nIngredients\nsalt");
    expect(errors).toEqual([{ line: 5, message: expect.stringContaining("doppelt") }]);
  });

  it("parses the short form with a bare servings number and separators", () => {
    const { recipe, errors } = parseRecipeText("Carbonara\n4\n---\n400 g spaghetti\n4 eggs\n---\nBoil the pasta.\n---\nFrom Nonna");
    expect(errors).toEqual([]);
    expect(recipe).toEqual({
      name: "Carbonara",
      servingSize: 4,
      weblink: null,
      ingredients: [
        { line: 4, name: "spaghetti", quantity: 400, unit: "g", note: null },
        { line: 5, name: "eggs", quantity: 4, unit: "pcs", note: null },
      ],
      instructions: "Boil the pasta.",
      comments: "From Nonna",
    });
  });

  it("accepts only whole servings numbers of at least 1", () => {
    expect(parseRecipeText("Soup\n2\n---\nwater").errors).toEqual([]);
    expect(parseRecipeText("Soup\n0\n---\nwater").errors).toEqual([{ line: 2, message: expect.stringContaining("ganze Zahl") }]);
    expect(parseRecipeText("Soup\n2.5\n---\nwater").errors).toEqual([{ line: 2, message: expect.stringContaining("ganze Zahl") }]);
  });

  it("accepts the servings in German", () => {
    for (const serves of ["4 Personen", "für 4", "Für 4 Personen", "4 Portionen", "4 personen"]) {
      const { recipe, errors } = parseRecipeText(`Soup\n${serves}\n---\nwater`);
      expect(errors).toEqual([]);
      expect(recipe.servingSize).toBe(4);
    }
    expect(parseRecipeText("Soup\n1 Person\n---\nwater").recipe.servingSize).toBe(1);
    expect(parseRecipeText("Soup\nfür vier Personen\n---\nwater").errors)
      .toEqual([{ line: 2, message: expect.stringContaining("ganze Zahl") }]);
  });

  it("mixes separators with headings", () => {
    const { recipe, errors } = parseRecipeText("Soup\nServes 2\nIngredients\nwater\n-----\nCook.\nComments\nWarming");
    expect(errors).toEqual([]);
    expect(recipe).toMatchObject({ instructions: "Cook.", comments: "Warming" });
    expect(parseRecipeText("Soup\n2\n---\nwater\n---\nCook.\nInstructions\nAgain").errors)
      .toEqual([{ line: 7, message: expect.stringContaining("doppelt") }]);
  });

  it("allows empty sections and stopping early", () => {
    expect(parseRecipeText("Soup\n2\n---\nwater\n---\n---\nWarming").recipe)
      .toMatchObject({ instructions: null, comments: "Warming" });
    expect(parseRecipeText("Soup\n2\n---\nwater").recipe).toMatchObject({ instructions: null, comments: null });
  });

  it("reports a separator after the comments", () => {
    const { errors } = parseRecipeText("Soup\n2\n---\nwater\n---\nCook.\n---\nWarming\n---");
    expect(errors).toEqual([{ line: 9, message: expect.stringContaining("Nach den Anmerkungen") }]);
  });

  it("reads an optional weblink before or after the servings", () => {
    const after = parseRecipeText("Soup\n2\nhttps://example.com/soup\n---\nwater");
    expect(after.errors).toEqual([]);
    expect(after.recipe).toMatchObject({ servingSize: 2, weblink: "https://example.com/soup" });
    const before = parseRecipeText("Soup\nwww.example.com/soup\nServes 2\n---\nwater");
    expect(before.errors).toEqual([]);
    expect(before.recipe).toMatchObject({ servingSize: 2, weblink: "https://www.example.com/soup" });
  });

  it("reports an invalid or second weblink", () => {
    expect(parseRecipeText("Soup\n2\nhttps://exa mple.com\n---\nwater").errors)
      .toEqual([{ line: 3, message: expect.stringContaining("gültige Webadresse") }]);
    expect(parseRecipeText("Soup\nhttps://a.com\n2\nhttps://b.com\n---\nwater").errors)
      .toEqual([{ line: 4, message: expect.stringContaining("Zeile 2") }]);
  });
});

describe("parseItemsText", () => {
  it("parses one item per line, skipping blank lines", () => {
    expect(parseItemsText("500 g Tomaten\n\nSalz\n200 ml Sahne - mind. 30% Fett")).toEqual({
      items: [
        { line: 1, name: "Tomaten", quantity: 500, unit: "g", note: null },
        { line: 3, name: "Salz", quantity: null, unit: null, note: null },
        { line: 4, name: "Sahne", quantity: 200, unit: "ml", note: "mind. 30% Fett" },
      ],
      errors: [],
    });
  });

  it("reports bad lines and repeated items by line", () => {
    expect(parseItemsText("2 Zwiebeln\n0 g Mehl\n1 zwiebeln").errors).toEqual([
      { line: 2, message: "Die Menge muss größer als 0 sein." },
      { line: 3, message: "„zwiebeln“ steht schon in Zeile 1; bitte zu einer Zeile zusammenfassen." },
    ]);
  });

  it("reports an existing item's name and plural as the same item", () => {
    const items = [{ name: "Zwiebel", plural: "Zwiebeln" }];
    expect(parseItemsText("1 Zwiebel\n2 Zwiebeln - in Ringen", items).errors).toEqual([
      { line: 2, message: "„Zwiebeln“ ist derselbe Artikel wie „Zwiebel“ in Zeile 1; bitte zu einer Zeile zusammenfassen." },
    ]);
    // Without the item, they're two new ones
    expect(parseItemsText("1 Zwiebel\n2 Zwiebeln").errors).toEqual([]);
  });
});

describe("ingredientToText", () => {
  it("writes the amount before the name, and the note after a dash", () => {
    expect(ingredientToText({ name: "Spaghetti", quantity: 400, unit: "g", note: null })).toBe("400 g Spaghetti");
    expect(ingredientToText({ name: "Olivenöl", quantity: 1, unit: "tbsp", note: null })).toBe("1 EL Olivenöl");
    expect(ingredientToText({ name: "Tomaten", quantity: 2, unit: "can", note: "gehackt" })).toBe("2 Dosen Tomaten - gehackt");
    expect(ingredientToText({ name: "Mehl", quantity: 1.5, unit: "kg", note: null })).toBe("1,5 kg Mehl");
    expect(ingredientToText({ name: "Wasser", quantity: 1000, unit: "ml", note: null })).toBe("1000 ml Wasser");
    expect(ingredientToText({ name: "Salz", quantity: null, unit: null, note: "nach Geschmack" })).toBe("Salz - nach Geschmack");
  });

  it("leaves out pcs and uses the plural for several", () => {
    expect(ingredientToText({ name: "Ei", plural: "Eier", quantity: 4, unit: "pcs", note: null })).toBe("4 Eier");
    expect(ingredientToText({ name: "Ei", plural: "Eier", quantity: 1, unit: "pcs", note: null })).toBe("1 Ei");
  });

  it("quotes names that wouldn't read back the same", () => {
    expect(ingredientToText({ name: "Salz, Pfeffer", quantity: null, unit: null, note: null })).toBe('"Salz, Pfeffer"');
    expect(ingredientToText({ name: "Feta (mild)", quantity: 200, unit: "g", note: null })).toBe('200 g "Feta (mild)"');
    expect(ingredientToText({ name: "Dose Tomaten", quantity: 2, unit: "pcs", note: null })).toBe('2 "Dose Tomaten"');
    expect(ingredientToText({ name: "5-Minuten-Terrine", quantity: null, unit: null, note: null })).toBe('"5-Minuten-Terrine"');
    expect(ingredientToText({ name: "chili-flakes", quantity: 1, unit: "tsp", note: null })).toBe("1 TL chili-flakes");
  });
});

describe("recipeToText", () => {
  const recipe: RecipeForText = {
    name: "Carbonara",
    servingSize: 4,
    weblink: "https://example.com/carbonara",
    instructions: "Boil the pasta.\r\n\r\n**Quickly** mix in the eggs.",
    comments: "From Nonna",
    ingredients: [
      { name: "Spaghetti", quantity: 400, unit: "g", note: null },
      { name: "Eier", quantity: 4, unit: "pcs", note: null },
      { name: "Salz, grob", quantity: null, unit: null, note: "to taste" },
      { name: "Pecorino", quantity: 0.5, unit: "pack", note: "fein gerieben; oder Parmesan" },
    ],
  };

  it("writes the sections under headings", () => {
    expect(recipeToText(recipe)).toBe(`Carbonara
4
https://example.com/carbonara

Zutaten
400 g Spaghetti
4 Eier
"Salz, grob" - to taste
0,5 Packungen Pecorino - fein gerieben; oder Parmesan

Zubereitung
Boil the pasta.

**Quickly** mix in the eggs.

Anmerkungen
From Nonna`);
  });

  it("reads back with parseRecipeText", () => {
    const { recipe: parsed, errors } = parseRecipeText(recipeToText(recipe));
    expect(errors).toEqual([]);
    expect({ ...parsed, ingredients: parsed.ingredients.map(({ line, ...ing }) => ing) }).toEqual({
      ...recipe,
      instructions: "Boil the pasta.\n\n**Quickly** mix in the eggs.",
    });
  });

  it("leaves out empty parts", () => {
    const text = recipeToText({ ...recipe, weblink: null, instructions: null, comments: "Warming" });
    expect(text).not.toContain("Zubereitung");
    expect(parseRecipeText(text).recipe).toMatchObject({ weblink: null, instructions: null, comments: "Warming" });
  });
});
