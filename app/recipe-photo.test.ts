import { describe, expect, it } from "vitest";
import { parseRecipeText } from "./recipe-import";
import { EXAMPLE } from "./recipe-format-prompt";

describe("EXAMPLE", () => {
  // The model copies this format, so it has to be one the import accepts
  it("parses without errors", () => {
    const { recipe, errors } = parseRecipeText(EXAMPLE);
    expect(errors).toEqual([]);
    expect(recipe).toMatchObject({ name: "Kartoffelsuppe", servingSize: 4 });
    expect(recipe.ingredients.map((i) => i.name)).toEqual(["Kartoffeln", "Zwiebeln", "Gemüsebrühe", "Sahne", "Petersilie", "Salz, Pfeffer"]);
    expect(recipe.comments).toBe("Hält sich 2 Tage im Kühlschrank.");
  });
});
