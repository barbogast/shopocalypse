import { describe, expect, it } from "vitest";
import { listAmounts } from "./shopping-list";

const pasta = { recipeId: 1, itemId: 10, quantity: 500, unit: "g", alwaysAvailable: false } as const;
const onion = { recipeId: 1, itemId: 11, quantity: 1, unit: "pcs", alwaysAvailable: false } as const;
const salt = { recipeId: 1, itemId: 12, quantity: null, unit: null, alwaysAvailable: true } as const;
const eggs = { recipeId: 2, itemId: 13, quantity: 3, unit: "pcs", alwaysAvailable: false } as const;
const riceOnion = { recipeId: 2, itemId: 11, quantity: 0.5, unit: "pcs", alwaysAvailable: false } as const;
const ingredients = [pasta, onion, salt, eggs, riceOnion];

describe("listAmounts", () => {
  it("scales each meal to its servings and adds up items across meals", () => {
    const meals = [
      { recipeId: 1, servings: 4, servingSize: 4 },
      { recipeId: 1, servings: 6, servingSize: 4 },
    ];
    expect(listAmounts(meals, ingredients, false)).toEqual(new Map([
      [10, [{ quantity: 1.25, unit: "kg" }]],
      [11, [{ quantity: 3, unit: "pcs" }]], // 1 + 1.5, rounded up
    ]));
  });

  it("combines an item used by different recipes", () => {
    const meals = [
      { recipeId: 1, servings: 4, servingSize: 4 },
      { recipeId: 2, servings: 2, servingSize: 2 },
    ];
    expect(listAmounts(meals, ingredients, false).get(11)).toEqual([{ quantity: 2, unit: "pcs" }]);
  });

  it("leaves out always-available items unless asked for", () => {
    const meals = [{ recipeId: 1, servings: 4, servingSize: 4 }];
    expect(listAmounts(meals, ingredients, false).has(12)).toBe(false);
    expect(listAmounts(meals, ingredients, true).get(12)).toEqual([]);
  });

  it("returns nothing for no meals", () => {
    expect(listAmounts([], ingredients, true).size).toBe(0);
  });
});
