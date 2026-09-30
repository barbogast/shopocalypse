# Data Model

## Entities

### Store

- id
- name

### ItemCategory

- id
- name

### Item

- id
- name
- category_id (e.g. "produce", "dairy", "canned goods" — used to sort shopping list)
- store_id

### Recipe

- id
- name
- serving_size (integer — fixed per recipe)
- instructions (free text, optional)
- comments (free text, optional)
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
- ShoppingListItem → Item: many-to-one (nullable)

## Notes and assumptions

- Single shared instance — no user accounts or authentication
- All quantities are plain integers (no units)
- Only one ShoppingList can be active at a time; completing it archives the old one
- Item.category_id and item.store_id is the basis for shop/aisle sorting on the shopping list
- "Cook meal" is the sole mechanism that advances the schedule and writes CookHistory
