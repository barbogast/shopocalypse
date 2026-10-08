import { and, asc, desc, eq, gt, inArray, isNull, lt, max } from "drizzle-orm";
import { db } from "./client";
import { itemCategories, items, recipeIngredients, recipes, shoppingListItems, stock, stores } from "./schema";
import { int, optionalText, text } from "~/forms";
import { itemKey, itemKeys } from "~/recipe-import";
import { combineAmounts, formatAmount, isUnitKey, mergeAmounts } from "~/units";

// Shelves in walking order, grouped by store
export async function listShelves() {
  return db.select().from(itemCategories).orderBy(asc(itemCategories.storeId), asc(itemCategories.position)).all();
}

// Items that can be picked as another item's parent: those that aren't variants themselves
export async function listParents(exceptId?: number) {
  return (await db
    .select({ id: items.id, name: items.name, parentId: items.parentId, storeId: items.storeId, categoryId: items.categoryId })
    .from(items)
    .orderBy(asc(items.name))
    .all())
    .filter((i) => i.parentId == null && i.id !== exceptId);
}

// Reads the item form's name/plural/parent/store/shelf/unit fields; a shelf must belong to the chosen store.
// Names and plurals must be unique across all items, so each one matches a single item.
// Pass the item's own id when editing, so keeping its name isn't a clash.
export async function parseItemForm(form: FormData, itemId?: number) {
  const name = text(form, "name");
  const parentId = int(form, "parentId");
  const rawPlural = optionalText(form, "plural");
  const plural = rawPlural && itemKey(rawPlural) !== itemKey(name) ? rawPlural : null;
  const storeId = int(form, "storeId");
  const categoryId = int(form, "categoryId");
  const rawUnit = form.get("defaultUnit");
  const defaultUnit = isUnitKey(rawUnit) ? rawUnit : null;
  const alwaysAvailable = form.get("alwaysAvailable") === "on";

  if (!name) return { error: "Name is required." } as const;
  const clash = await nameClash([name, plural], itemId);
  if (clash) return { error: clash } as const;
  if (parentId != null) {
    const parent = await db.select().from(items).where(eq(items.id, parentId)).get();
    if (!parent || parent.id === itemId) return { error: "Pick another item as the parent." } as const;
    if (parent.parentId != null) return { error: `"${parent.name}" is a variant itself.` } as const;
    if (itemId != null && await db.select().from(items).where(eq(items.parentId, itemId)).limit(1).get()) {
      return { error: "This item has variants, so it can't be a variant itself." } as const;
    }
  }
  if (categoryId != null) {
    const shelf = await db.select().from(itemCategories).where(eq(itemCategories.id, categoryId)).get();
    if (!shelf || shelf.storeId !== storeId) return { error: "That shelf isn't in the chosen store." } as const;
  }
  return { values: { name, plural, parentId, storeId, categoryId, defaultUnit, alwaysAvailable } } as const;
}

type ItemValues = NonNullable<Awaited<ReturnType<typeof parseItemForm>>["values"]>;

// Saves an edited item; variants on its old store and shelf move along, variants elsewhere stay put
export async function updateItem(id: number, values: ItemValues) {
  await db.transaction(async (tx) => {
    const old = await tx.select().from(items).where(eq(items.id, id)).get();
    if (!old) return;
    await tx.update(items).set(values).where(eq(items.id, id)).run();
    await tx
      .update(items)
      .set({ storeId: values.storeId, categoryId: values.categoryId })
      .where(and(
        eq(items.parentId, id),
        old.storeId == null ? isNull(items.storeId) : eq(items.storeId, old.storeId),
        old.categoryId == null ? isNull(items.categoryId) : eq(items.categoryId, old.categoryId),
      ))
      .run();
  });
}

// Why one of the words can't be an item's name or plural, or null when no other item uses them
async function nameClash(words: (string | null)[], itemId?: number) {
  const others = (await db.select({ id: items.id, name: items.name, plural: items.plural }).from(items).all())
    .filter((i) => i.id !== itemId);
  for (const word of words) {
    const clash = word && others.find((i) => itemKeys(i).includes(itemKey(word)));
    if (!clash) continue;
    if (itemKey(clash.name) === itemKey(word)) return `There's already an item called "${clash.name}".` as const;
    return `"${word}" is already the plural of "${clash.name}".` as const;
  }
  return null;
}

// Gives an item a plural, e.g. when a recipe import uses it
export async function setPlural(itemId: number, plural: string) {
  const error = await nameClash([plural], itemId);
  if (!error) await db.update(items).set({ plural }).where(eq(items.id, itemId)).run();
  return { error };
}

export async function addShelf(storeId: number, name: string) {
  const [{ last }] = await db
    .select({ last: max(itemCategories.position) })
    .from(itemCategories)
    .where(eq(itemCategories.storeId, storeId))
    .all();
  await db.insert(itemCategories).values({ name, storeId, position: (last ?? 0) + 1 }).run();
}

// Swap positions with the neighbouring shelf in the same store
export async function moveShelf(id: number, up: boolean) {
  await db.transaction(async (tx) => {
    const current = await tx.select().from(itemCategories).where(eq(itemCategories.id, id)).get();
    if (!current) return;
    const neighbour = await tx
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
    await tx.update(itemCategories).set({ position: neighbour.position }).where(eq(itemCategories.id, current.id)).run();
    await tx.update(itemCategories).set({ position: current.position }).where(eq(itemCategories.id, neighbour.id)).run();
  });
}

// Items on the shelf stay in the store, just without a shelf
export async function deleteShelf(id: number) {
  await db.transaction(async (tx) => {
    await tx.update(items).set({ categoryId: null }).where(eq(items.categoryId, id)).run();
    await tx.delete(itemCategories).where(eq(itemCategories.id, id)).run();
  });
}

// Removes the store's shelves too; its items are kept without a store or shelf
export async function deleteStore(id: number) {
  await db.transaction(async (tx) => {
    await tx.update(items).set({ storeId: null, categoryId: null }).where(eq(items.storeId, id)).run();
    await tx.delete(itemCategories).where(eq(itemCategories.storeId, id)).run();
    await tx.delete(stores).where(eq(stores.id, id)).run();
  });
}

// Items used in recipes can't be deleted; their stock and shopping list entries go with them.
// Its variants stay, as items of their own.
export async function deleteItem(id: number) {
  await db.transaction(async (tx) => {
    if (await tx.select().from(recipeIngredients).where(eq(recipeIngredients.itemId, id)).limit(1).get()) return;
    await tx.update(items).set({ parentId: null }).where(eq(items.parentId, id)).run();
    await tx.delete(stock).where(eq(stock.itemId, id)).run();
    await tx.delete(shoppingListItems).where(eq(shoppingListItems.itemId, id)).run();
    await tx.delete(items).where(eq(items.id, id)).run();
  });
}

// Replaces a duplicate item with another one everywhere, then deletes it. Where both are on the same recipe or
// shopping list, their amounts are added up; a recipe using both in units that don't add up blocks the merge.
// The kept item takes over the duplicate's store, shelf, plural and default unit if it has none of its own,
// and the duplicate's variants become variants of the kept item (or of its parent, if it's a variant), keeping
// their own store and shelf.
export async function mergeItem(duplicateId: number, keepId: number) {
  return db.transaction(async (tx) => {
    const duplicate = await tx.select().from(items).where(eq(items.id, duplicateId)).get();
    const keep = await tx.select().from(items).where(eq(items.id, keepId)).get();
    if (!duplicate || !keep || duplicateId === keepId) return { error: "Pick another item to merge into." } as const;

    // Recipes listing both: fold the duplicate's ingredient into the kept one
    const dupIngredients = await tx.select().from(recipeIngredients).where(eq(recipeIngredients.itemId, duplicateId)).all();
    const keepIngredients = dupIngredients.length === 0 ? [] : await tx
      .select({ ingredient: recipeIngredients, recipeName: recipes.name })
      .from(recipeIngredients)
      .innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
      .where(and(
        eq(recipeIngredients.itemId, keepId),
        inArray(recipeIngredients.recipeId, dupIngredients.map((i) => i.recipeId)),
      ))
      .all();
    // Check every recipe before changing any, so a blocked merge leaves nothing half done
    const folds = [];
    for (const { ingredient: kept, recipeName } of keepIngredients) {
      const dup = dupIngredients.find((i) => i.recipeId === kept.recipeId)!;
      const amount = mergeAmounts(kept, dup);
      if (!amount) {
        return {
          error: `"${recipeName}" has both, as ${formatAmount(dup)} and ${formatAmount(kept)}, which don't add up. ` +
            "Change one of them in the recipe first.",
        } as const;
      }
      const note = [...new Set([kept.note, dup.note].filter(Boolean))].join(", ") || null;
      folds.push({ recipeId: kept.recipeId, amount, note, position: Math.min(kept.position, dup.position) });
    }
    for (const { recipeId, amount, note, position } of folds) {
      await tx
        .update(recipeIngredients)
        .set({ ...amount, note, position })
        .where(and(eq(recipeIngredients.recipeId, recipeId), eq(recipeIngredients.itemId, keepId)))
        .run();
      await tx
        .delete(recipeIngredients)
        .where(and(eq(recipeIngredients.recipeId, recipeId), eq(recipeIngredients.itemId, duplicateId)))
        .run();
    }
    await tx.update(recipeIngredients).set({ itemId: keepId }).where(eq(recipeIngredients.itemId, duplicateId)).run();

    // Shopping lists with both: add up the amounts; still to buy if either was
    const dupEntries = await tx.select().from(shoppingListItems).where(eq(shoppingListItems.itemId, duplicateId)).all();
    for (const dup of dupEntries) {
      const kept = await tx
        .select()
        .from(shoppingListItems)
        .where(and(eq(shoppingListItems.shoppingListId, dup.shoppingListId), eq(shoppingListItems.itemId, keepId)))
        .get();
      if (kept) {
        await tx
          .update(shoppingListItems)
          .set({ amounts: combineAmounts([...kept.amounts, ...dup.amounts]), bought: kept.bought && dup.bought })
          .where(eq(shoppingListItems.id, kept.id))
          .run();
        await tx.delete(shoppingListItems).where(eq(shoppingListItems.id, dup.id)).run();
      } else {
        await tx.update(shoppingListItems).set({ itemId: keepId }).where(eq(shoppingListItems.id, dup.id)).run();
      }
    }

    // Stock is keyed by item: the kept item's own entry wins
    if (await tx.select().from(stock).where(eq(stock.itemId, keepId)).get()) {
      await tx.delete(stock).where(eq(stock.itemId, duplicateId)).run();
    } else {
      await tx.update(stock).set({ itemId: keepId }).where(eq(stock.itemId, duplicateId)).run();
    }

    // A variant of the duplicate that's kept takes its place
    const keepParentId = keep.parentId === duplicateId ? null : keep.parentId;
    await tx
      .update(items)
      .set({
        ...(keep.storeId == null && { storeId: duplicate.storeId, categoryId: duplicate.categoryId }),
        parentId: keepParentId,
        plural: keep.plural ?? duplicate.plural,
        defaultUnit: keep.defaultUnit ?? duplicate.defaultUnit,
      })
      .where(eq(items.id, keepId))
      .run();
    const newParentId = keepParentId ?? keepId;
    await tx.update(items).set({ parentId: newParentId }).where(eq(items.parentId, duplicateId)).run();
    await tx.delete(items).where(eq(items.id, duplicateId)).run();
    return { error: null } as const;
  });
}
