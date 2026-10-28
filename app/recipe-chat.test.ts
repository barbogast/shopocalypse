import { describe, expect, it } from "vitest";
import { chatUserTurn, parseChat } from "./recipe-chat";

describe("parseChat", () => {
  it("reads back a saved chat", () => {
    const chat = [{ role: "user", content: "Etwas mit Lauch" }, { role: "assistant", content: "Wie wäre eine Suppe?" }] as const;
    expect(parseChat(JSON.stringify(chat))).toEqual(chat);
  });

  it("treats a missing or broken chat as empty", () => {
    expect(parseChat(null)).toEqual([]);
    expect(parseChat("not json")).toEqual([]);
    expect(parseChat(JSON.stringify([{ role: "system", content: "x" }]))).toEqual([]);
  });
});

describe("chatUserTurn", () => {
  it("puts the current draft before the message", () => {
    expect(chatUserTurn(" Weniger Sahne ", "Suppe\n4\n")).toBe("Aktueller Entwurf:\n\nSuppe\n4\n\n---\n\nWeniger Sahne");
  });

  it("says when there's no draft yet", () => {
    expect(chatUserTurn("Etwas mit Lauch", "  ")).toBe("Noch kein Entwurf.\n\n---\n\nEtwas mit Lauch");
  });
});
