import { describe, expect, it } from "vitest";
import { parseRecipeText, recipeToText } from "./recipe-import";
import { EXAMPLE } from "./recipe-format-prompt";

describe("EXAMPLE", () => {
  // The model copies this format, so it has to be one the import accepts
  it("parses without errors", () => {
    const { recipe, errors } = parseRecipeText(EXAMPLE);
    expect(errors).toEqual([]);
    expect(recipe).toMatchObject({ name: "Kartoffelsuppe", servingSize: 4, weblink: "https://example.com/kartoffelsuppe" });
    expect(recipe.ingredients.map((i) => i.name)).toEqual(["Kartoffeln", "Zwiebeln", "Gemüsebrühe", "Sahne", "Petersilie", "Salz, Pfeffer"]);
    expect(recipe.comments).toBe("Hält sich 2 Tage im Kühlschrank.");
  });

  // …and the one the app writes recipes out in, so reworking a recipe in the chat doesn't reformat it
  it("is written the way the app writes recipes", () => {
    const { recipe } = parseRecipeText(EXAMPLE);
    expect(recipeToText({ ...recipe, servingSize: recipe.servingSize! })).toBe(EXAMPLE);
  });
});
