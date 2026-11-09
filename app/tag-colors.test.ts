import { describe, expect, it } from "vitest";
import { nextTagColor, TAG_COLORS } from "./tag-colors";

describe("nextTagColor", () => {
  it("takes the palette in order while colors are free", () => {
    expect(nextTagColor([])).toBe("blue");
    expect(nextTagColor(["blue"])).toBe("green");
  });

  it("reuses a color freed by a deleted tag before going round again", () => {
    expect(nextTagColor(TAG_COLORS.filter((c) => c !== "teal"))).toBe("teal");
    expect(nextTagColor([...TAG_COLORS, "blue"])).toBe("green");
  });
});
