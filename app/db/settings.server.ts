import { eq } from "drizzle-orm";
import { db } from "./client";
import * as schema from "./schema";

type SettingKey = "recipePreferences";

export async function getSetting(key: SettingKey): Promise<string | null> {
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return row?.value ?? null;
}

// An empty value removes the setting
export async function setSetting(key: SettingKey, value: string) {
  if (!value) {
    await db.delete(schema.settings).where(eq(schema.settings.key, key)).run();
    return;
  }
  await db.insert(schema.settings).values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } }).run();
}
