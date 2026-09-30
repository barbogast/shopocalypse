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

### Recipe

- id
- name
- serving_size (integer — fixed per recipe)
- instructions (free text, optional)
- comments (free text, optional)
- archived (boolean) — recipes that have been cooked are archived instead of deleted, to keep meal history intact
- ingredients: list of RecipeIngredient

### RecipeIngredient _(join between Recipe and Ingredient)_

- recipe_id
- item_id
- quantity (integer)

### Stock _(one entry per ingredient)_

- item_id
- current_quantity (integer)
- desired_quantity (integer)

### MealSchedule _(the ordered queue of upcoming meals)_

- position (determines order)
- recipe_id

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

A recipe appears once per scheduled meal, so it can be listed more than once.

### ShoppingListItem

- id
- shopping_list_id
- item_id
- quantity_needed (integer)
- quantity_bought (integer — set when ticking off; may be less than quantity_needed)
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
- All quantities are plain integers (no units)
- Only one ShoppingList can be active at a time; completing it archives the old one
- The shopping list is grouped by store, then by shelf in the store's shelf order
- "Cook meal" is the sole mechanism that advances the schedule and writes CookHistory
