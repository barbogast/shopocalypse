import { describe, expect, it } from "vitest";
import { type Catalog, describeCatalog, sanitizeSuggestion } from "./item-suggest";

const catalog: Catalog = {
  stores: [{ id: 1, name: "Supermarkt" }, { id: 2, name: "Markt" }],
  shelves: [{ id: 10, name: "Gemüse", storeId: 1 }, { id: 20, name: "Stand", storeId: 2 }],
  items: [
    { id: 100, name: "Linsen", plural: null, parentId: null, storeId: 1, categoryId: null, defaultUnit: "g" },
    { id: 101, name: "Berglinsen", plural: null, parentId: 100, storeId: 1, categoryId: null, defaultUnit: "g" },
    { id: 102, name: "Karotte", plural: "Karotten", parentId: null, storeId: 1, categoryId: 10, defaultUnit: "pcs" },
  ],
};

const raw = { singular: null, storeId: 1, categoryId: 10, defaultUnit: "pcs", plural: "Zwiebeln", parentId: null };

describe("sanitizeSuggestion", () => {
  it("keeps a valid suggestion", () => {
    expect(sanitizeSuggestion(raw, "Zwiebel", catalog)).toEqual(raw);
  });

  it("drops unknown stores, and shelves outside the store", () => {
    expect(sanitizeSuggestion({ ...raw, storeId: 9 }, "Zwiebel", catalog)).toMatchObject({ storeId: null, categoryId: null });
    expect(sanitizeSuggestion({ ...raw, categoryId: 20 }, "Zwiebel", catalog)).toMatchObject({ storeId: 1, categoryId: null });
  });

  it("only takes top-level items as parents", () => {
    expect(sanitizeSuggestion({ ...raw, parentId: 100 }, "Rote Linsen", catalog).parentId).toBe(100);
    expect(sanitizeSuggestion({ ...raw, parentId: 101 }, "Rote Linsen", catalog).parentId).toBeNull();
    expect(sanitizeSuggestion({ ...raw, parentId: 999 }, "Rote Linsen", catalog).parentId).toBeNull();
  });

  it("drops units that aren't unit keys", () => {
    expect(sanitizeSuggestion({ ...raw, defaultUnit: "Stück" }, "Zwiebel", catalog).defaultUnit).toBeNull();
  });

  it("drops a plural that's the name or another item's name or plural", () => {
    expect(sanitizeSuggestion({ ...raw, plural: " zwiebel " }, "Zwiebel", catalog).plural).toBeNull();
    expect(sanitizeSuggestion({ ...raw, plural: "Karotten" }, "Möhre", catalog).plural).toBeNull();
    expect(sanitizeSuggestion({ ...raw, plural: "Linsen" }, "Linse", catalog).plural).toBeNull();
  });
});

describe("sanitizeSuggestion for plural names", () => {
  it("renames to the singular and keeps the name given as the plural", () => {
    expect(sanitizeSuggestion({ ...raw, singular: "Apfel", plural: null }, "Äpfel", catalog)).toMatchObject({ singular: "Apfel", plural: "Äpfel" });
  });

  it("drops a singular that's the name itself or another item's name or plural", () => {
    expect(sanitizeSuggestion({ ...raw, singular: "radieschen" }, "Radieschen", catalog)).toMatchObject({ singular: null, plural: "Zwiebeln" });
    expect(sanitizeSuggestion({ ...raw, singular: "Karotten" }, "Möhren", catalog).singular).toBeNull();
  });
});

describe("describeCatalog", () => {
  it("lists items under their store and shelf, with unshelved items after", () => {
    const text = describeCatalog(catalog);
    expect(text).toContain(` Shelf "Gemüse" (shelf id 10)\n  - Karotte (item id 102): unit pcs, plural Karotten`);
    expect(text).toContain(" No shelf\n  - Linsen (item id 100): unit g\n  - Berglinsen (item id 101): unit g, variant of Linsen");
  });
});
