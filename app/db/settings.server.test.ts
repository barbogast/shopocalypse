import "./test-db";
import { describe, expect, it } from "vitest";
import { getSetting, setSetting } from "./settings.server";

describe("settings", () => {
  it("saves, replaces and removes a setting", async () => {
    expect(await getSetting("recipePreferences")).toBeNull();
    await setSetting("recipePreferences", "Viel Gemüse");
    await setSetting("recipePreferences", "Wenig Fleisch");
    expect(await getSetting("recipePreferences")).toBe("Wenig Fleisch");
    await setSetting("recipePreferences", "");
    expect(await getSetting("recipePreferences")).toBeNull();
  });
});
