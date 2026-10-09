import { describe, expect, it } from "vitest";
import { addNote, listAmounts, listAsText } from "./shopping-list";

const pasta = { recipeId: 1, itemId: 10, quantity: 500, unit: "g", alwaysAvailable: false, note: null, noteOnList: false } as const;
const onion = { recipeId: 1, itemId: 11, quantity: 1, unit: "pcs", alwaysAvailable: false, note: null, noteOnList: false } as const;
const salt = { recipeId: 1, itemId: 12, quantity: null, unit: null, alwaysAvailable: true, note: null, noteOnList: false } as const;
const eggs = { recipeId: 2, itemId: 13, quantity: 3, unit: "pcs", alwaysAvailable: false, note: null, noteOnList: false } as const;
const riceOnion = { recipeId: 2, itemId: 11, quantity: 0.5, unit: "pcs", alwaysAvailable: false, note: null, noteOnList: false } as const;
const ingredients = [pasta, onion, salt, eggs, riceOnion];

describe("listAmounts", () => {
  it("scales each meal to its servings and adds up items across meals", () => {
    const meals = [
      { recipeId: 1, servings: 4, servingSize: 4 },
      { recipeId: 1, servings: 6, servingSize: 4 },
    ];
    expect(listAmounts(meals, ingredients, false)).toEqual(new Map([
      [10, { amounts: [{ quantity: 1.25, unit: "kg" }], notes: [] }],
      [11, { amounts: [{ quantity: 3, unit: "pcs" }], notes: [] }], // 1 + 1.5, rounded up
    ]));
  });

  it("combines an item used by different recipes", () => {
    const meals = [
      { recipeId: 1, servings: 4, servingSize: 4 },
      { recipeId: 2, servings: 2, servingSize: 2 },
    ];
    expect(listAmounts(meals, ingredients, false).get(11)?.amounts).toEqual([{ quantity: 2, unit: "pcs" }]);
  });

  it("leaves out always-available items unless asked for", () => {
    const meals = [{ recipeId: 1, servings: 4, servingSize: 4 }];
    expect(listAmounts(meals, ingredients, false).has(12)).toBe(false);
    expect(listAmounts(meals, ingredients, true).get(12)).toEqual({ amounts: [], notes: [] });
  });

  it("returns nothing for no meals", () => {
    expect(listAmounts([], ingredients, true).size).toBe(0);
  });

  describe("notes on the list", () => {
    const cream = { recipeId: 1, itemId: 20, quantity: 200, unit: "ml", alwaysAvailable: false, note: null, noteOnList: false } as const;
    const richCream = { ...cream, recipeId: 2, note: "mind. 30% Fett", noteOnList: true } as const;
    const lightCream = { ...cream, recipeId: 3, quantity: 100, note: "10% Fett", noteOnList: true } as const;
    const meal = (recipeId: number, servings = 2) => ({ recipeId, servings, servingSize: 2 });

    it("keeps the part of the total a note applies to", () => {
      expect(listAmounts([meal(1), meal(2)], [cream, richCream], false).get(20)).toEqual({
        amounts: [{ quantity: 400, unit: "ml" }],
        notes: [{ note: "mind. 30% Fett", amounts: [{ quantity: 200, unit: "ml" }] }],
      });
    });

    it("lists different notes separately and adds up the same note across meals", () => {
      const notes = listAmounts([meal(3), meal(2), meal(2, 4)], [richCream, lightCream], false).get(20)?.notes;
      expect(notes).toEqual([
        { note: "10% Fett", amounts: [{ quantity: 100, unit: "ml" }] },
        { note: "mind. 30% Fett", amounts: [{ quantity: 600, unit: "ml" }] },
      ]);
    });

    it("leaves out notes that aren't for the list", () => {
      const prepNote = { ...cream, note: "geschlagen" };
      expect(listAmounts([meal(1)], [prepNote], false).get(20)?.notes).toEqual([]);
    });

    it("keeps a note without a quantity", () => {
      const lemon = { recipeId: 1, itemId: 21, quantity: null, unit: null, alwaysAvailable: false, note: "unbehandelt", noteOnList: true };
      expect(listAmounts([meal(1)], [lemon], false).get(21)?.notes).toEqual([{ note: "unbehandelt", amounts: [] }]);
    });

    it("doesn't round up the noted part", () => {
      const egg = { recipeId: 1, itemId: 22, quantity: 1, unit: "pcs", alwaysAvailable: false, note: "Bio", noteOnList: true } as const;
      expect(listAmounts([meal(1, 3)], [egg], false).get(22)).toEqual({
        amounts: [{ quantity: 2, unit: "pcs" }],
        notes: [{ note: "Bio", amounts: [{ quantity: 1.5, unit: "pcs" }] }],
      });
    });
  });
});

describe("addNote", () => {
  it("adds up amounts of the same note and appends new ones", () => {
    const notes = [{ note: "Bio", amounts: [{ quantity: 1, unit: "pcs" as const }] }];
    expect(addNote(notes, { note: "Bio", amounts: [{ quantity: 2, unit: "pcs" }] }, { note: "reif", amounts: [] })).toEqual([
      { note: "Bio", amounts: [{ quantity: 3, unit: "pcs" }] },
      { note: "reif", amounts: [] },
    ]);
    expect(notes[0].amounts).toEqual([{ quantity: 1, unit: "pcs" }]);
  });
});

describe("listAsText", () => {
  const row = { itemPlural: null, notes: [], bought: false };

  it("puts each item still to buy on its own line, amount first", () => {
    expect(listAsText([
      { ...row, itemName: "Tomate", itemPlural: "Tomaten", amounts: [{ quantity: 500, unit: "g" }] },
      { ...row, itemName: "Salz", amounts: [] },
      { ...row, itemName: "Milch", amounts: [{ quantity: 1, unit: "l" }], bought: true },
      { ...row, itemName: "Ei", itemPlural: "Eier", amounts: [{ quantity: 6, unit: "pcs" }] },
    ])).toBe("500 g Tomaten\nSalz\n6 Stk. Eier");
  });

  it("adds notes in brackets", () => {
    expect(listAsText([
      {
        ...row,
        itemName: "Sahne",
        amounts: [{ quantity: 400, unit: "ml" }],
        notes: [{ note: "mind. 30% Fett", amounts: [{ quantity: 200, unit: "ml" }] }, { note: "Bio", amounts: [] }],
      },
    ])).toBe("400 ml Sahne (200 ml mind. 30% Fett; Bio)");
  });
});
