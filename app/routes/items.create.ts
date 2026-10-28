import { parseItemForm } from "~/db/items.server";
import { db } from "~/db/client";
import * as schema from "~/db/schema";
import type { Route } from "./+types/items.create";

// Creates an item from the item form, for the item picker's "Create" option
export async function action({ request }: Route.ActionArgs) {
  const parsed = await parseItemForm(await request.formData());
  if (parsed.error) return { error: parsed.error };
  const [item] = await db
    .insert(schema.items)
    .values(parsed.values)
    .returning({ id: schema.items.id, name: schema.items.name, plural: schema.items.plural, defaultUnit: schema.items.defaultUnit });
  return { item };
}
