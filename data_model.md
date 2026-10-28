# Data Model

## Entities

### Store

- id
- name

### ItemCategory _(a shelf in a store; shown as "Shelf" in the app)_

- id
- name (e.g. "Produce", "Dairy")
- store_id — each store has its own shelves
- position — the order you walk past the shelves in that store

### Item

- id
- name — unique, ignoring case
- plural (optional) — also matched when importing recipes and searching items; unique across all names and plurals
- parent_id (optional) — makes it a variant of another item (Berglinsen of Linsen). Variants are listed right under their parent. They have their own store and shelf, prefilled from the parent; when the parent moves, variants on its old store and shelf move along. One level only: a parent can't be a variant itself
- store_id
- category_id — the shelf; must be one of the item's store's shelves
- default_unit (optional) — prefilled when adding the item to a recipe or the shopping list
- always_available (boolean) — assumed to be in stock (salt, oil…); left off prepared shopping lists unless "Include items in stock" is checked

### Recipe

- id
- name
- serving_size (integer) — the servings the ingredient quantities are for
- instructions (free text, optional)
- comments (free text, optional)
- weblink (optional) — where the recipe came from; always an http(s) URL
- created_at — when it was added. Recipes from before 2026-10-08 have made-up times, one second apart in id order, so only their order is meaningful
- archived (boolean) — recipes that have been cooked or are on a shopping list are archived instead of deleted, to keep meal history and the lists intact
- auto_fill (boolean, default true) — whether auto-filling the schedule may pick it; off for occasional dishes, which are then only added by hand
- ingredients: list of RecipeIngredient

### RecipeIngredient _(join between Recipe and Ingredient)_

- recipe_id
- item_id
- quantity (decimal, optional)
- unit (optional) — both are empty when the recipe gives no quantity (e.g. spices)

### RecipeVersion _(edit history of a recipe)_

- recipe_id
- saved_at — when the version was last edited
- text — the recipe written out in the import format (name, servings, weblink, ingredients, instructions, comments). Note-on-list, auto-fill and archived aren't part of it

Recorded after every change to a recipe's content (recipe page, creating, importing, comments when cooking). A change within 30 minutes of the latest version updates it instead of adding one, so an editing session makes one version; a session undone back to the version before leaves nothing. The history page shows each version's line diff against the one before. Recipes from before 2026-10-10 got a first version from their content then, dated with their created_at, so it holds any earlier edits too. That backfill runs on deploy (`scripts/migrate.ts`) and locally with `yarn db:backfill`, since it needs the app's code. Renaming or merging an item changes the text of every recipe using it without recording a version, so the next edit of such a recipe shows the rename in its diff, under that edit's date

### Stock _(one entry per ingredient)_

- item_id
- current_quantity (integer)
- desired_quantity (integer)

### MealSchedule _(the ordered queue of upcoming meals)_

- position (determines order)
- recipe_id
- servings (optional) — servings to cook; empty means the recipe's serving size

The "next meal" pointer is implicit: it's always the entry at the lowest position. Cooking a meal removes the head entry and appends a MealHistory record.

### MealHistory

- recipe_id
- cooked_at (date)

Used to determine "least recently cooked" when auto-filling the schedule.

### ShoppingList _(at most one active list at a time)_

- id
- created_at
- status: active | completed
- include_in_stock (boolean) — the "Include items in stock" choice when preparing; meals added or removed later follow it. Lists from before it was stored count as off

### ShoppingListRecipe _(meals a list was prepared for)_

- id
- shopping_list_id
- recipe_id
- servings (optional) — servings shopped for; empty means the recipe's serving size

A recipe appears once per scheduled meal, so it can be listed more than once. Meals can be added (any recipe) or removed while the list is active: each item then gets the difference between what the old and new meals need, so amounts added by hand stay and rounding up is redone. An item goes when nothing is left of it, unless it was added by hand; one that needs more is unticked

### ShoppingListItem

- id
- shopping_list_id
- item_id
- amounts (JSON list of `{ quantity, unit }`) — what's needed, one entry per unit kind (e.g. `10 g + 2 tbsp`); empty when no quantity is given
- bought (boolean) — set when ticking off
- source: meal_plan | stock_deficit | manual

## Key relationships

- Recipe ↔ Item: many-to-many via RecipeIngredient
- RecipeVersion → Recipe: many-to-one
- Stock → Item: one-to-one
- MealSchedule → Recipe: many-to-one
- MealHistory → Recipe: many-to-one
- ShoppingListRecipe → ShoppingList, Recipe: many-to-one
- ShoppingListItem → Item: many-to-one (nullable)
- ItemCategory → Store: many-to-one

## Notes and assumptions

- Single shared instance — no user accounts; one shared password (HTTP Basic Auth, `app/auth.server.ts`) guards the whole app
- Units are a fixed list in code (`app/units.ts`). g/kg and ml/l are added up with each other; every other unit (pcs, tbsp, can, bottle, …) only with itself — there's no conversion between kinds
- Stock quantities are still plain integers without units; stock tracking was removed from the app (the table is kept) and needs its own unit design before it comes back
- Only one ShoppingList can be active at a time; completing it archives the old one
- Ingredient quantities are scaled by servings / serving_size when preparing a shopping list and when cooking a scheduled meal. Summed list amounts in units bought whole (pcs, can, jar, pack, bottle, crate, bunch) are rounded up
- The shopping list is grouped by store, then by shelf in the store's shelf order; within a shelf, variants on their parent's shelf follow it
- "Cook meal" is the sole mechanism that advances the schedule and writes MealHistory
