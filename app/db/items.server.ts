import { and, asc, desc, eq, gt, lt, max } from "drizzle-orm";
import { db } from "./client";
import { itemCategories, items, stores } from "./schema";
import { isUnitKey } from "~/units";

// Shelves in walking order, grouped by store
export function listShelves() {
  return db.select().from(itemCategories).orderBy(asc(itemCategories.storeId), asc(itemCategories.position)).all();
}

// Reads the item form's name/store/shelf/unit fields; a shelf must belong to the chosen store
export function parseItemForm(form: FormData) {
  const name = String(form.get("name")).trim();
  const storeId = form.get("storeId") ? Number(form.get("storeId")) : null;
  const categoryId = form.get("categoryId") ? Number(form.get("categoryId")) : null;
  const rawUnit = form.get("defaultUnit");
  const defaultUnit = isUnitKey(rawUnit) ? rawUnit : null;
  const alwaysAvailable = form.get("alwaysAvailable") === "on";

  if (!name) return { error: "Name is required." } as const;
  if (categoryId != null) {
    const shelf = db.select().from(itemCategories).where(eq(itemCategories.id, categoryId)).get();
    if (!shelf || shelf.storeId !== storeId) return { error: "That shelf isn't in the chosen store." } as const;
  }
  return { values: { name, storeId, categoryId, defaultUnit, alwaysAvailable } } as const;
}

export function addShelf(storeId: number, name: string) {
  const [{ last }] = db
    .select({ last: max(itemCategories.position) })
    .from(itemCategories)
    .where(eq(itemCategories.storeId, storeId))
    .all();
  db.insert(itemCategories).values({ name, storeId, position: (last ?? 0) + 1 }).run();
}

// Swap positions with the neighbouring shelf in the same store
export function moveShelf(id: number, up: boolean) {
  db.transaction((tx) => {
    const current = tx.select().from(itemCategories).where(eq(itemCategories.id, id)).get();
    if (!current) return;
    const neighbour = tx
      .select()
      .from(itemCategories)
      .where(and(
        eq(itemCategories.storeId, current.storeId),
        up ? lt(itemCategories.position, current.position) : gt(itemCategories.position, current.position),
      ))
      .orderBy(up ? desc(itemCategories.position) : asc(itemCategories.position))
      .limit(1)
      .get();
    if (!neighbour) return;
    tx.update(itemCategories).set({ position: neighbour.position }).where(eq(itemCategories.id, current.id)).run();
    tx.update(itemCategories).set({ position: current.position }).where(eq(itemCategories.id, neighbour.id)).run();
  });
}

// Items on the shelf stay in the store, just without a shelf
export function deleteShelf(id: number) {
  db.transaction((tx) => {
    tx.update(items).set({ categoryId: null }).where(eq(items.categoryId, id)).run();
    tx.delete(itemCategories).where(eq(itemCategories.id, id)).run();
  });
}

// Removes the store's shelves too; its items are kept without a store or shelf
export function deleteStore(id: number) {
  db.transaction((tx) => {
    tx.update(items).set({ storeId: null, categoryId: null }).where(eq(items.storeId, id)).run();
    tx.delete(itemCategories).where(eq(itemCategories.storeId, id)).run();
    tx.delete(stores).where(eq(stores.id, id)).run();
  });
}
