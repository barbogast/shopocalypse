import { describe, expect, it } from "vitest";
import { addMonths, daysBefore, isDateString, localDate, monthName, monthWeeks, weekdayName } from "./dates";

describe("localDate", () => {
  it("uses local date parts, zero-padded", () => {
    expect(localDate(new Date(2026, 0, 5, 0, 30))).toBe("2026-01-05");
  });
});

describe("daysBefore", () => {
  it("counts back across month and year ends", () => {
    expect(daysBefore("2026-11-05", 1)).toBe("2026-11-04");
    expect(daysBefore("2026-11-01", 1)).toBe("2026-10-31");
    expect(daysBefore("2026-01-01", 3)).toBe("2025-12-29");
  });

  it("isn't thrown off by a daylight saving change", () => {
    expect(daysBefore("2026-03-30", 1)).toBe("2026-03-29");
    expect(daysBefore("2026-10-26", 1)).toBe("2026-10-25");
  });
});

describe("weekdayName", () => {
  it("names the weekday in German", () => {
    expect(weekdayName("2026-11-05")).toBe("Donnerstag");
    expect(weekdayName("2026-11-01")).toBe("Sonntag");
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

describe("monthWeeks", () => {
  it("lays out a month in weeks from Monday, padded with null", () => {
    // November 2026 starts on a Sunday and ends on a Monday
    const weeks = monthWeeks("2026-11");
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(weeks[5]).toEqual(["2026-11-30", null, null, null, null, null, null]);
  });

  it("needs no padding for a month from Monday to Sunday", () => {
    // February 2027 starts on a Monday and has four weeks
    expect(monthWeeks("2027-02").flat()).not.toContain(null);
    expect(monthWeeks("2027-02")).toHaveLength(4);
  });
});

describe("addMonths", () => {
  it("steps across year ends", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});

describe("monthName", () => {
  it("names the month in German", () => {
    expect(monthName("2026-03")).toBe("März 2026");
  });
});
