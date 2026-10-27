import { desc, eq } from "drizzle-orm";
import { db } from "./client";
import * as schema from "./schema";

export async function listDrafts() {
  const drafts = await db.select().from(schema.recipeDrafts).orderBy(desc(schema.recipeDrafts.updatedAt)).all();
  // Named by their first line, which is the recipe's name in the import format
  return drafts.map(({ id, text, updatedAt }) => ({ id, name: text.trim().split(/\r?\n/)[0].trim(), updatedAt }));
}

export async function getDraft(id: number) {
  return db.select().from(schema.recipeDrafts).where(eq(schema.recipeDrafts.id, id)).get();
}

export async function createDraft(text: string) {
  const draft = await db.insert(schema.recipeDrafts).values({ text, updatedAt: new Date().toISOString() }).returning().get();
  return draft.id;
}

// Last save wins; a draft deleted meanwhile (imported or discarded on another device) stays deleted
export async function saveDraft(id: number, text: string) {
  await db.update(schema.recipeDrafts).set({ text, updatedAt: new Date().toISOString() }).where(eq(schema.recipeDrafts.id, id)).run();
}

export async function deleteDraft(id: number) {
  await db.delete(schema.recipeDrafts).where(eq(schema.recipeDrafts.id, id)).run();
}
