import { describe, expect, it } from "vitest";
import { applyEntries, settled, unsynced } from "./tick-outbox";

const rows = [
  { id: 1, bought: false },
  { id: 2, bought: true },
];

describe("settled", () => {
  it("drops synced entries, since the load already has them", () => {
    expect(settled({ 1: { bought: true, synced: true } }, rows)).toEqual({});
  });

  it("keeps unsent entries the server doesn't have yet", () => {
    expect(settled({ 1: { bought: true, synced: false } }, rows)).toEqual({ 1: { bought: true, synced: false } });
  });

  it("drops unsent entries the server already agrees with", () => {
    expect(settled({ 2: { bought: true, synced: false } }, rows)).toEqual({});
  });

  it("drops entries for items no longer on the list", () => {
    expect(settled({ 3: { bought: true, synced: false } }, rows)).toEqual({});
  });
});

describe("applyEntries", () => {
  it("shows ticks and unticks over the loaded rows", () => {
    expect(applyEntries(rows, { 1: { bought: true, synced: false }, 2: { bought: false, synced: true } })).toEqual([
      { id: 1, bought: true },
      { id: 2, bought: false },
    ]);
  });

  it("keeps rows without an entry as they are", () => {
    expect(applyEntries(rows, {})[0]).toBe(rows[0]);
  });
});

describe("unsynced", () => {
  it("lists what still needs sending", () => {
    expect(unsynced({ 1: { bought: true, synced: false }, 2: { bought: false, synced: true } })).toEqual([{ id: 1, bought: true }]);
  });
});
