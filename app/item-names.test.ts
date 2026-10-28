import { describe, expect, it } from "vitest";
import { itemKey, itemKeys, likelySingular } from "./item-names";

describe("itemKey", () => {
  it("ignores case and spacing", () => {
    expect(itemKey("  Olive   Oil ")).toBe(itemKey("olive oil"));
  });
});

describe("itemKeys", () => {
  it("includes the plural when there is one", () => {
    expect(itemKeys({ name: "Knoblauchzehe", plural: "Knoblauchzehen" })).toEqual(["knoblauchzehe", "knoblauchzehen"]);
    expect(itemKeys({ name: "Salz", plural: null })).toEqual(["salz"]);
  });
});

describe("likelySingular", () => {
  const items = [
    { name: "Knoblauchzehe", plural: null },
    { name: "Ei", plural: null },
    { name: "Tomate", plural: "Tomaten" },
  ];

  it("finds the item a name adds a plural ending to", () => {
    expect(likelySingular("knoblauchzehen", items)?.name).toBe("Knoblauchzehe");
    expect(likelySingular("Eier", items)?.name).toBe("Ei");
  });

  it("skips items that have a plural already", () => {
    expect(likelySingular("Tomatens", items)).toBeUndefined();
  });

  it("doesn't suggest the item itself", () => {
    expect(likelySingular("Ei", items)).toBeUndefined();
  });
});
