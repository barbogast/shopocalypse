import { eq } from "drizzle-orm";
import { db } from "./client";
import { shoppingLists } from "./schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The one active shopping list (a unique index allows at most one), if any.
// Pass a transaction to read within it.
export async function getActiveList(q: typeof db | Tx = db) {
  return (await q.select().from(shoppingLists).where(eq(shoppingLists.status, "active")).get()) ?? null;
}
