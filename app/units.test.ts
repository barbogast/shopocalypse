import { describe, expect, it } from "vitest";
import { combineAmounts, formatAmount, formatAmounts, parseAmount, roundUpToBuy, scaleAmount } from "./units";

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("combineAmounts", () => {
  it("adds mass across g and kg and switches to kg from 1000 g", () => {
    expect(combineAmounts([{ quantity: 500, unit: "g" }, { quantity: 0.75, unit: "kg" }])).toEqual([
      { quantity: 1.25, unit: "kg" },
    ]);
    expect(combineAmounts([{ quantity: 200, unit: "g" }, { quantity: 300, unit: "g" }])).toEqual([
      { quantity: 500, unit: "g" },
    ]);
  });

  it("adds volume across ml and l", () => {
    expect(combineAmounts([{ quantity: 1, unit: "l" }, { quantity: 250, unit: "ml" }])).toEqual([
      { quantity: 1.25, unit: "l" },
    ]);
  });

  it("keeps other units separate from each other", () => {
    expect(combineAmounts([
      { quantity: 2, unit: "pcs" },
      { quantity: 1, unit: "can" },
      { quantity: 3, unit: "pcs" },
    ])).toEqual([
      { quantity: 5, unit: "pcs" },
      { quantity: 1, unit: "can" },
    ]);
  });

  it("drops amounts without a quantity", () => {
    expect(combineAmounts([{ quantity: null, unit: null }])).toEqual([]);
    expect(combineAmounts([{ quantity: null, unit: null }, { quantity: 2, unit: "tbsp" }])).toEqual([
      { quantity: 2, unit: "tbsp" },
    ]);
  });
});

describe("scaleAmount", () => {
  it("scales by servings over serving size", () => {
    expect(scaleAmount({ quantity: 300, unit: "g" }, 6, 4)).toEqual({ quantity: 450, unit: "g" });
  });

  it("leaves amounts without a quantity alone", () => {
    expect(scaleAmount({ quantity: null, unit: null }, 6, 4)).toEqual({ quantity: null, unit: null });
  });
});

describe("roundUpToBuy", () => {
  it("rounds units bought whole up", () => {
    expect(roundUpToBuy([{ quantity: 1.5, unit: "can" }, { quantity: 2.01, unit: "pcs" }])).toEqual([
      { quantity: 2, unit: "can" },
      { quantity: 3, unit: "pcs" },
    ]);
  });

  it("doesn't round up floating point noise", () => {
    expect(roundUpToBuy([{ quantity: (0.1 + 0.2) * 10, unit: "pcs" }])).toEqual([{ quantity: 3, unit: "pcs" }]);
  });

  it("leaves mass, volume and spoons alone", () => {
    const amounts = [{ quantity: 1.5, unit: "kg" }, { quantity: 0.5, unit: "tsp" }] as const;
    expect(roundUpToBuy([...amounts])).toEqual(amounts);
  });
});

describe("parseAmount", () => {
  it("treats an empty quantity as no quantity", () => {
    expect(parseAmount(form({ quantity: " ", unit: "g" }))).toEqual({ amount: { quantity: null, unit: null } });
  });

  it("reads a quantity and unit", () => {
    expect(parseAmount(form({ quantity: "2.5", unit: "kg" }))).toEqual({ amount: { quantity: 2.5, unit: "kg" } });
  });

  it("rejects zero, negative and non-numeric quantities", () => {
    for (const quantity of ["0", "-1", "abc"]) {
      expect(parseAmount(form({ quantity, unit: "g" }))).toHaveProperty("error");
    }
  });

  it("rejects unknown units", () => {
    expect(parseAmount(form({ quantity: "1", unit: "furlong" }))).toEqual({ error: "Pick a unit." });
  });
});

describe("formatting", () => {
  it("uses singular and plural labels", () => {
    expect(formatAmount({ quantity: 1, unit: "can" })).toBe("1 Dose");
    expect(formatAmount({ quantity: 2, unit: "can" })).toBe("2 Dosen");
    expect(formatAmount({ quantity: null, unit: null })).toBe("—");
  });

  it("joins combined amounts", () => {
    expect(formatAmounts([{ quantity: 500, unit: "g" }, { quantity: 2, unit: "pcs" }])).toBe("500 g + 2 Stk.");
    expect(formatAmounts([])).toBe("—");
  });
});
