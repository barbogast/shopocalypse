import { describe, expect, it } from "vitest";
import { inOrder, moved, parseOrder, sameIds } from "./reorder";

describe("parseOrder", () => {
  it("reads distinct positive ids", () => {
    expect(parseOrder("3,1,2")).toEqual([3, 1, 2]);
  });

  it("refuses anything else", () => {
    for (const value of [null, "", "1,,2", "1,x", "0,1", "1.5", "1,1"]) expect(parseOrder(value)).toBeNull();
  });
});

describe("sameIds", () => {
  it("matches the same ids in any order", () => {
    expect(sameIds([1, 2, 3], [3, 1, 2])).toBe(true);
  });

  it("notices an added or removed id", () => {
    expect(sameIds([1, 2, 3], [1, 2])).toBe(false);
    expect(sameIds([1, 2], [1, 2, 3])).toBe(false);
    expect(sameIds([1, 2], [1, 4])).toBe(false);
  });
});

describe("inOrder", () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it("puts the items in the given order", () => {
    expect(inOrder(items, (i) => i.id, [3, 1, 2]).map((i) => i.id)).toEqual([3, 1, 2]);
  });

  it("leaves them as they are without an order or when the ids differ", () => {
    expect(inOrder(items, (i) => i.id, null)).toBe(items);
    expect(inOrder(items, (i) => i.id, [1, 2])).toBe(items);
  });
});

describe("moved", () => {
  it("moves an id up or down", () => {
    expect(moved([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3]);
    expect(moved([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
  });
});
