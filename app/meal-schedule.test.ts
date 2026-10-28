import { describe, expect, it } from "vitest";
import { rotationOrder } from "./meal-schedule";

const ids = (recipes: { id: number }[]) => recipes.map((r) => r.id);

describe("rotationOrder", () => {
  const recipes = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

  it("puts never cooked recipes first, then the least recently cooked", () => {
    const lastCooked = new Map([[1, "2026-10-01"], [2, "2026-09-01"], [4, "2026-10-20"]]);
    expect(ids(rotationOrder(recipes, [], lastCooked))).toEqual([3, 2, 1, 4]);
  });

  it("puts scheduled recipes last, in the order they come up", () => {
    expect(ids(rotationOrder(recipes, [4, 2], new Map()))).toEqual([1, 3, 4, 2]);
  });

  it("goes by a recipe's last place in the queue", () => {
    expect(ids(rotationOrder(recipes, [2, 4, 2], new Map()))).toEqual([1, 3, 4, 2]);
  });
});
