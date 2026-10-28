import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db/client";
import { nameClash, updateItem } from "~/db/items.server";
import * as schema from "~/db/schema";
import { type Catalog, describeCatalog, sanitizeSuggestion, type Suggestion } from "~/item-suggest";
import { itemKey } from "~/recipe-import";

const MODEL = "claude-opus-5-5";

const SYSTEM = `You file new grocery items for a German-speaking family's shopping app.
The catalog below lists the stores, their shelves in walking order, and the items already on each shelf.
For each new item name, suggest:
- singular: names are kept in the singular, with the plural alongside. If the name given is a German plural ("Äpfel"), give its singular ("Apfel"); otherwise null. Also null when singular and plural are the same ("Radieschen") and for words normally only used in the plural ("Nudeln", "Linsen", "Haferflocken").
- storeId and categoryId (shelf): where this household would buy it. Follow how the catalog files similar items, not general knowledge. The shelf must belong to the store. Use null when nothing fits.
- defaultUnit: the unit the item is usually counted or weighed in, as one of the unit keys. Follow similar items in the catalog.
- plural: the German plural of the (singular) name, only if it differs from it (null for uncountables like "Mehl" and words only used in the plural).
- parentId: the item id of an existing item this is clearly a variant of ("Berglinsen" is a variant of "Linsen"), otherwise null. Only items that aren't variants themselves can be parents.
Answer for every name, in the order given, repeating each name exactly.`;

const RawSuggestionSchema = z.object({
  singular: z.string().nullable(),
  storeId: z.number().int().nullable(),
  categoryId: z.number().int().nullable(),
  defaultUnit: z.string().nullable(),
  plural: z.string().nullable(),
  parentId: z.number().int().nullable(),
});

const ResponseSchema = z.object({ items: z.array(RawSuggestionSchema.extend({ name: z.string() })) });

// Suggestions accepted in the recipe import's review, as posted back
export const AcceptedSchema = z.array(RawSuggestionSchema.extend({ itemId: z.number().int() }));

// Items in exceptIds are left out, so an item being filed doesn't serve as its own example (or parent)
export async function loadCatalog(exceptIds: number[] = []): Promise<Catalog> {
  return {
    stores: await db.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores).orderBy(asc(schema.stores.name)).all(),
    shelves: await db
      .select({ id: schema.itemCategories.id, name: schema.itemCategories.name, storeId: schema.itemCategories.storeId })
      .from(schema.itemCategories)
      .orderBy(asc(schema.itemCategories.storeId), asc(schema.itemCategories.position))
      .all(),
    items: (await db
      .select({
        id: schema.items.id,
        name: schema.items.name,
        plural: schema.items.plural,
        parentId: schema.items.parentId,
        storeId: schema.items.storeId,
        categoryId: schema.items.categoryId,
        defaultUnit: schema.items.defaultUnit,
      })
      .from(schema.items)
      .orderBy(asc(schema.items.name))
      .all()).filter((i) => !exceptIds.includes(i.id)),
  };
}

// One request for all the names; suggestions come back in the same order.
// Pass the ids of the items when they already exist.
export async function suggestItems(names: string[], itemIds: number[] = []): Promise<{ suggestions: Suggestion[] } | { error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { error: "Suggestions need ANTHROPIC_API_KEY to be set." };
  if (names.length === 0) return { suggestions: [] };

  const catalog = await loadCatalog(itemIds);
  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ResponseSchema) },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `Catalog:\n${describeCatalog(catalog)}\n\nNew items:\n${names.map((n) => `- ${n}`).join("\n")}`,
      }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { error: "The ANTHROPIC_API_KEY was refused." };
    if (error instanceof Anthropic.RateLimitError) return { error: "Too many suggestions at once; try again in a minute." };
    if (error instanceof Anthropic.APIError) return { error: `Suggestions failed (${error.status ?? "no connection"}).` };
    // Anything else (an answer that doesn't parse, say) would replace the page with the error page
    console.error(error);
    return { error: "Suggestions failed; try again." };
  }
  if (response.stop_reason === "refusal" || !response.parsed_output) return { error: "No suggestions this time; try again." };

  // Matched by name, falling back to position if the model changed a name's spelling
  const answers = response.parsed_output.items;
  const suggestions = names.map((name, index) => {
    const raw = answers.find((a) => itemKey(a.name) === itemKey(name)) ?? answers[index];
    return raw
      ? sanitizeSuggestion(raw, name, catalog)
      : { singular: null, storeId: null, categoryId: null, defaultUnit: null, plural: null, parentId: null };
  });
  return { suggestions };
}

// Saves accepted suggestions: renames items given a singular, and fills only each item's empty fields.
// Values are checked again against the current catalog first. Returns the ids of the items that now have a shelf.
export async function applySuggestions(accepted: z.infer<typeof AcceptedSchema>) {
  const shelved: number[] = [];
  for (const { itemId, ...raw } of accepted) {
    const item = await db.select().from(schema.items).where(eq(schema.items.id, itemId)).get();
    if (!item) continue;
    const s = sanitizeSuggestion(raw, item.name, await loadCatalog([itemId]));
    const storeId = item.storeId ?? s.storeId;
    // The suggested shelf is in the suggested store, so it only fits where that's the item's store
    const categoryId = item.categoryId ?? (storeId === s.storeId ? s.categoryId : null);
    const name = s.singular && !(await nameClash([s.singular], itemId)) ? s.singular : item.name;
    const plural = item.plural ?? (s.plural && itemKey(s.plural) !== itemKey(name) && !(await nameClash([s.plural], itemId)) ? s.plural : null);
    await updateItem(itemId, {
      name,
      plural,
      parentId: item.parentId ?? s.parentId,
      storeId,
      categoryId,
      defaultUnit: item.defaultUnit ?? s.defaultUnit,
      alwaysAvailable: item.alwaysAvailable,
    });
    if (categoryId != null) shelved.push(itemId);
  }
  return shelved;
}
