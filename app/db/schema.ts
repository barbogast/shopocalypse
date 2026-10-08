import { sql } from "drizzle-orm";
import { integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Amount, UnitKey } from "../units";

export const stores = sqliteTable("stores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

// Shelves: each store has its own, ordered by position (the walking order through the store)
export const itemCategories = sqliteTable("item_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  storeId: integer("store_id")
    .notNull()
    .references(() => stores.id),
  position: integer("position").notNull().default(0),
});

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  categoryId: integer("category_id").references(() => itemCategories.id),
  storeId: integer("store_id").references(() => stores.id),
  // Unit prefilled when adding the item to a recipe or the shopping list
  defaultUnit: text("default_unit").$type<UnitKey>(),
  // Assumed to be in stock (salt, oil…): left off prepared shopping lists unless asked for
  alwaysAvailable: integer("always_available", { mode: "boolean" }).notNull().default(false),
}, (t) => [
  // Backstop for parseItemForm's check, which also catches non-ASCII case differences
  uniqueIndex("items_name_unique").on(sql`${t.name} collate nocase`),
]);

export const recipes = sqliteTable("recipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  servingSize: integer("serving_size").notNull(),
  instructions: text("instructions"),
  comments: text("comments"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
});

export const recipeIngredients = sqliteTable("recipe_ingredients", {
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipes.id),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id),
  // Both null when the recipe gives no quantity (e.g. spices)
  quantity: real("quantity"),
  unit: text("unit").$type<UnitKey>(),
  // How to prepare it, e.g. "finely chopped"
  note: text("note"),
  // Order within the recipe, as written in the original
  position: integer("position").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.recipeId, t.itemId] })]);

export const stock = sqliteTable("stock", {
  itemId: integer("item_id")
    .primaryKey()
    .references(() => items.id),
  currentQuantity: integer("current_quantity").notNull().default(0),
  desiredQuantity: integer("desired_quantity").notNull().default(0),
});

export const mealSchedule = sqliteTable("meal_schedule", {
  position: integer("position").primaryKey(),
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipes.id),
  // Servings to cook; null means the recipe's own serving size
  servings: integer("servings"),
});

export const mealHistory = sqliteTable("meal_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipes.id),
  cookedAt: text("cooked_at").notNull(),
});

export const shoppingLists = sqliteTable("shopping_lists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull(),
  status: text("status", { enum: ["active", "completed"] }).notNull().default("active"),
}, (t) => [
  // At most one active list
  uniqueIndex("one_active_list").on(t.status).where(sql`status = 'active'`),
]);

// Meals a shopping list was prepared for (a recipe may appear more than once)
export const shoppingListRecipes = sqliteTable("shopping_list_recipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shoppingListId: integer("shopping_list_id")
    .notNull()
    .references(() => shoppingLists.id),
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipes.id),
  // Servings the meal was shopped for; null means the recipe's own serving size
  servings: integer("servings"),
});

export const shoppingListItems = sqliteTable("shopping_list_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shoppingListId: integer("shopping_list_id")
    .notNull()
    .references(() => shoppingLists.id),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id),
  // Combined amounts needed, one per unit kind; empty when no quantity is given
  amounts: text("amounts", { mode: "json" }).$type<Amount[]>().notNull(),
  bought: integer("bought", { mode: "boolean" }).notNull().default(false),
  source: text("source", { enum: ["meal_plan", "stock_deficit", "manual"] }).notNull(),
}, (t) => [uniqueIndex("shopping_list_items_list_item").on(t.shoppingListId, t.itemId)]);
