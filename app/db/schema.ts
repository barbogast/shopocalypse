import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const stores = sqliteTable("stores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

export const itemCategories = sqliteTable("item_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  categoryId: integer("category_id").references(() => itemCategories.id),
  storeId: integer("store_id").references(() => stores.id),
});

export const recipes = sqliteTable("recipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  servingSize: integer("serving_size").notNull(),
  instructions: text("instructions"),
  comments: text("comments"),
});

export const recipeIngredients = sqliteTable("recipe_ingredients", {
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipes.id),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id),
  quantity: integer("quantity").notNull(),
});

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
});

export const shoppingListItems = sqliteTable("shopping_list_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shoppingListId: integer("shopping_list_id")
    .notNull()
    .references(() => shoppingLists.id),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id),
  quantityNeeded: integer("quantity_needed").notNull(),
  quantityBought: integer("quantity_bought"),
  source: text("source", { enum: ["meal_plan", "stock_deficit", "manual"] }).notNull(),
});
