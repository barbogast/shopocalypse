import { describe, expect, it } from "vitest";
import { int, optionalText, optionalUrl, text } from "./forms";

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("int", () => {
  it("reads positive whole numbers", () => {
    expect(int(form({ n: "3" }), "n")).toBe(3);
  });

  it("returns null for missing, empty, zero, fractional and non-numeric values", () => {
    expect(int(form({}), "n")).toBeNull();
    for (const n of ["", "0", "-2", "2.5", "abc"]) expect(int(form({ n }), "n")).toBeNull();
  });
});

describe("text", () => {
  it("trims and defaults to empty", () => {
    expect(text(form({ s: "  hi " }), "s")).toBe("hi");
    expect(text(form({}), "s")).toBe("");
    expect(optionalText(form({ s: "  " }), "s")).toBeNull();
  });
});

describe("optionalUrl", () => {
  it("accepts http(s) URLs and adds a missing scheme", () => {
    expect(optionalUrl(form({ u: " https://example.com/pasta " }), "u")).toBe("https://example.com/pasta");
    expect(optionalUrl(form({ u: "http://example.com" }), "u")).toBe("http://example.com/");
    expect(optionalUrl(form({ u: "example.com/pasta" }), "u")).toBe("https://example.com/pasta");
  });

  it("returns null when empty", () => {
    expect(optionalUrl(form({}), "u")).toBeNull();
    expect(optionalUrl(form({ u: "  " }), "u")).toBeNull();
  });

  it("refuses other schemes and non-URLs", () => {
    for (const u of ["javascript:alert(1)", "data:text/html,hi", "ftp://example.com", "not a url"]) {
      expect(optionalUrl(form({ u }), "u")).toBeUndefined();
    }
  });
});
