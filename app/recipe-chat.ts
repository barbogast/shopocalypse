// The chat with Claude that writes a recipe draft: the turns as kept with the draft, and the
// user turn as sent, with the draft's current text so Claude sees edits made by hand.

import { z } from "zod";

const ChatSchema = z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }));

export type ChatMessage = z.infer<typeof ChatSchema>[number];

// A chat column that doesn't read back (or none) is an empty chat, rather than a broken draft
export function parseChat(json: string | null): ChatMessage[] {
  if (!json) return [];
  try {
    const chat = ChatSchema.safeParse(JSON.parse(json));
    return chat.success ? chat.data : [];
  } catch {
    return [];
  }
}

export function chatUserTurn(message: string, draftText: string): string {
  const draft = draftText.trim() ? `Aktueller Entwurf:\n\n${draftText.trim()}` : "Noch kein Entwurf.";
  return `${draft}\n\n---\n\n${message.trim()}`;
}
