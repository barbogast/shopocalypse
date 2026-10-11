import { suggestItems } from "~/item-suggest.server";
import type { Route } from "./+types/items.suggest";

// Suggested store, shelf, unit, plural and parent for one or more item names, for the item form and the recipe import
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const names = form.getAll("name").map(String).map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return { error: "Enter a name first." };
  // The items' ids, when they already exist
  const itemIds = form.getAll("itemId").map(Number).filter((id) => Number.isInteger(id) && id > 0);
  return suggestItems(names, itemIds);
}
