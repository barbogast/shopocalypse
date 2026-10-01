import { describe, expect, it } from "vitest";
import { isDateString, localDate } from "./dates";

describe("localDate", () => {
  it("uses local date parts, zero-padded", () => {
    expect(localDate(new Date(2026, 0, 5, 0, 30))).toBe("2026-01-05");
  });
});

describe("isDateString", () => {
  it("accepts YYYY-MM-DD only", () => {
    expect(isDateString("2026-10-01")).toBe(true);
    expect(isDateString("2026-10-1")).toBe(false);
    expect(isDateString("garbage")).toBe(false);
    expect(isDateString(null)).toBe(false);
  });
});
