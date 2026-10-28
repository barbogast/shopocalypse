import { describe, expect, it } from "vitest";
import { findDurations, formatClock } from "./cook-timers";

describe("findDurations", () => {
  it("finds minutes in the spellings recipes use", () => {
    expect(findDurations("20 Minuten kochen, dann 1 Min. ruhen lassen und 1 Minute rühren")).toEqual([
      { index: 0, text: "20 Minuten", seconds: 1200 },
      { index: 24, text: "1 Min.", seconds: 60 },
      { index: 48, text: "1 Minute", seconds: 60 },
    ]);
  });

  it("takes the lower bound of a range", () => {
    expect(findDurations("15–20 Min. köcheln")).toEqual([{ index: 0, text: "15–20 Min.", seconds: 900 }]);
    expect(findDurations("15 - 20 Minuten")).toEqual([{ index: 0, text: "15 - 20 Minuten", seconds: 900 }]);
  });

  it("reads decimal commas", () => {
    expect(findDurations("1,5 Min")[0].seconds).toBe(90);
  });

  it("matches Thermomix settings", () => {
    expect(findDurations("15 Min./Varoma/Linkslauf")).toEqual([{ index: 0, text: "15 Min.", seconds: 900 }]);
  });

  it("ignores times without a number, seconds and other words", () => {
    expect(findDurations("einige Minuten erhitzen, 30 Sek. mixen, 5 mindestens, 5-Minuten-Terrine")).toEqual([]);
  });
});

describe("formatClock", () => {
  it("rounds up to whole seconds", () => {
    expect(formatClock(245_001)).toBe("4:06");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-500)).toBe("0:00");
  });

  it("shows hours when needed", () => {
    expect(formatClock(3_845_000)).toBe("1:04:05");
  });
});
