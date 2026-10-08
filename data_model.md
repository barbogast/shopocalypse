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
- name
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
- archived (boolean) — recipes that have been cooked are archived instead of deleted, to keep meal history intact
- ingredients: list of RecipeIngredient

### RecipeIngredient _(join between Recipe and Ingredient)_

- recipe_id
- item_id
- quantity (decimal, optional)
- unit (optional) — both are empty when the recipe gives no quantity (e.g. spices)

### Stock _(one entry per ingredient)_

- item_id
- current_quantity (integer)
- desired_quantity (integer)

### MealSchedule _(the ordered queue of upcoming meals)_

- position (determines order)
- recipe_id
- servings (optional) — servings to cook; empty means the recipe's serving size

The "next meal" pointer is implicit: it's always the entry at the lowest position. Cooking a meal removes the head entry and appends a CookHistory record.

### MealHistory

- recipe_id
- cooked_at (date)

Used to determine "least recently cooked" when auto-filling the schedule.

### ShoppingList _(at most one active list at a time)_

- id
- created_at
- status: active | completed

### ShoppingListRecipe _(meals a list was prepared for)_

- id
- shopping_list_id
- recipe_id
- servings (optional) — servings shopped for; empty means the recipe's serving size

A recipe appears once per scheduled meal, so it can be listed more than once.

### ShoppingListItem

- id
- shopping_list_id
- item_id
- amounts (JSON list of `{ quantity, unit }`) — what's needed, one entry per unit kind (e.g. `10 g + 2 tbsp`); empty when no quantity is given
- bought (boolean) — set when ticking off
- source: meal_plan | stock_deficit | manual

## Key relationships

- Recipe ↔ Item: many-to-many via RecipeIngredient
- Stock → Item: one-to-one
- MealSchedule → Recipe: many-to-one
- MealHistory → Recipe: many-to-one
- ShoppingListRecipe → ShoppingList, Recipe: many-to-one
- ShoppingListItem → Item: many-to-one (nullable)
- ItemCategory → Store: many-to-one

## Notes and assumptions

- Single shared instance — no user accounts or authentication
- Units are a fixed list in code (`app/units.ts`). g/kg and ml/l are added up with each other; every other unit (pcs, tbsp, can, bottle, …) only with itself — there's no conversion between kinds
- Stock quantities are still plain integers without units; stock tracking was removed from the app (the table is kept) and needs its own unit design before it comes back
- Only one ShoppingList can be active at a time; completing it archives the old one
- Ingredient quantities are scaled by servings / serving_size when preparing a shopping list and when cooking a scheduled meal. Summed list amounts in units bought whole (pcs, can, jar, pack, bottle, crate, bunch) are rounded up
- The shopping list is grouped by store, then by shelf in the store's shelf order
- "Cook meal" is the sole mechanism that advances the schedule and writes CookHistory
