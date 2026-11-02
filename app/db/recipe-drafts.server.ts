import { desc, eq } from "drizzle-orm";
import { type ChatMessage, parseChat } from "~/recipe-chat";
import { db } from "./client";
import * as schema from "./schema";

export async function listDrafts() {
  const drafts = await db.select().from(schema.recipeDrafts).orderBy(desc(schema.recipeDrafts.updatedAt)).all();
  // Named by their first line, which is the recipe's name in the import format
  return drafts.map(({ id, text, updatedAt, recipeId }) => ({ id, name: text.trim().split(/\r?\n/)[0].trim(), updatedAt, recipeId }));
}

export async function getDraft(id: number) {
  const draft = await db.select().from(schema.recipeDrafts).where(eq(schema.recipeDrafts.id, id)).get();
  return draft && { ...draft, chat: parseChat(draft.chat) };
}

export async function createDraft(text: string, chat: ChatMessage[] = [], recipeId: number | null = null) {
  const draft = await db.insert(schema.recipeDrafts)
    .values({ text, chat: chat.length ? JSON.stringify(chat) : null, recipeId, updatedAt: new Date().toISOString() })
    .returning().get();
  return draft.id;
}

// Last save wins; a draft deleted meanwhile (imported or discarded on another device) stays deleted
export async function saveDraft(id: number, text: string) {
  await db.update(schema.recipeDrafts).set({ text, updatedAt: new Date().toISOString() }).where(eq(schema.recipeDrafts.id, id)).run();
}

// A chat turn: the whole chat so far and the text it left
export async function saveChat(id: number, chat: ChatMessage[], text: string) {
  await db.update(schema.recipeDrafts)
    .set({ text, chat: JSON.stringify(chat), updatedAt: new Date().toISOString() })
    .where(eq(schema.recipeDrafts.id, id)).run();
}

// The open draft reworking a recipe, if there is one, so the recipe's button picks it up rather than starting another
export async function draftForRecipe(recipeId: number) {
  const draft = await db.select({ id: schema.recipeDrafts.id }).from(schema.recipeDrafts)
    .where(eq(schema.recipeDrafts.recipeId, recipeId)).orderBy(desc(schema.recipeDrafts.updatedAt)).get();
  return draft?.id ?? null;
}

export async function deleteDraft(id: number) {
  await db.delete(schema.recipeDrafts).where(eq(schema.recipeDrafts.id, id)).run();
}
