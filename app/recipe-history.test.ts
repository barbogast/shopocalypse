import { describe, expect, it } from "vitest";
import { diffVersions } from "./recipe-history";

const lines = (n: number, prefix = "line") => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);

describe("diffVersions", () => {
  it("marks changed lines and counts them", () => {
    const { lines: diff, added, removed } = diffVersions("Soup\n2\n\nIngredients\n1 Zwiebel", "Soup\n4\n\nIngredients\n1 Zwiebel");
    expect(diff).toEqual([
      { kind: "same", text: "Soup" },
      { kind: "removed", text: "2" },
      { kind: "added", text: "4" },
      { kind: "same", text: "" },
      { kind: "same", text: "Ingredients" },
      { kind: "same", text: "1 Zwiebel" },
    ]);
    expect([added, removed]).toEqual([1, 1]);
  });

  it("doesn't change the last line when a line is added after it", () => {
    expect(diffVersions("a\nb", "a\nb\nc").lines).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
      { kind: "added", text: "c" },
    ]);
  });

  it("cuts long unchanged stretches down to the lines around changes", () => {
    const older = [...lines(10), "old", ...lines(10, "end")].join("\n");
    const newer = [...lines(10), "new", ...lines(10, "end")].join("\n");
    expect(diffVersions(older, newer).lines).toEqual([
      { kind: "skipped", count: 8 },
      { kind: "same", text: "line 9" },
      { kind: "same", text: "line 10" },
      { kind: "removed", text: "old" },
      { kind: "added", text: "new" },
      { kind: "same", text: "end 1" },
      { kind: "same", text: "end 2" },
      { kind: "skipped", count: 8 },
    ]);
  });

  it("keeps a stretch between two changes whole unless it saves more than a line", () => {
    const older = ["a", ...lines(5), "b"].join("\n");
    const newer = ["A", ...lines(5), "B"].join("\n");
    expect(diffVersions(older, newer).lines.filter((l) => l.kind === "skipped")).toEqual([]);
    const longer = diffVersions(["a", ...lines(6), "b"].join("\n"), ["A", ...lines(6), "B"].join("\n"));
    expect(longer.lines).toContainEqual({ kind: "skipped", count: 2 });
  });
});
