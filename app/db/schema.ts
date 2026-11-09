import { sql } from "drizzle-orm";
import { type AnySQLiteColumn, blob, check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { ListNote } from "../shopping-list";
import type { TagColor } from "../tag-colors";
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
  // Also matched when importing recipes ("Knoblauchzehen" for "Knoblauchzehe")
  plural: text("plural"),
  categoryId: integer("category_id").references(() => itemCategories.id),
  storeId: integer("store_id").references(() => stores.id),
  // Variant of another item ("Berglinsen" of "Linsen"): listed under it, with its own store and shelf.
  // One level only, so a parent never has a parent itself
  parentId: integer("parent_id").references((): AnySQLiteColumn => items.id),
  // Unit prefilled when adding the item to a recipe or the shopping list
  defaultUnit: text("default_unit").$type<UnitKey>(),
  // Assumed to be in stock (salt, oil…): left off prepared shopping lists unless asked for
  alwaysAvailable: integer("always_available", { mode: "boolean" }).notNull().default(false),
  // Has to come out of the freezer ahead of cooking: warned about on the schedule and when cooking
  needsThawing: integer("needs_thawing", { mode: "boolean" }).notNull().default(false),
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
  // Where the recipe came from; always an http(s) URL
  weblink: text("weblink"),
  // ISO timestamp. Recipes from before it was stored got made-up ones that keep their id order
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  // Picked by the meal schedule's auto-fill; off for occasional dishes, which are then only added by hand
  autoFill: integer("auto_fill", { mode: "boolean" }).notNull().default(true),
});

// Labels chosen by the household ("Vegetarisch", "Schnell"), for filtering recipes and auto-fill.
// A tag no recipe uses any more is deleted, so there's no list of tags to keep tidy
export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // One of TAG_COLORS, chosen when the tag is created (nextTagColor)
  color: text("color").$type<TagColor>().notNull().default("blue"),
}, (t) => [
  // Backstop for setRecipeTags, which reuses a tag differing only in case
  uniqueIndex("tags_name_unique").on(sql`${t.name} collate nocase`),
]);

export const recipeTags = sqliteTable("recipe_tags", {
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipes.id),
  tagId: integer("tag_id")
    .notNull()
    .references(() => tags.id),
}, (t) => [primaryKey({ columns: [t.recipeId, t.tagId] }), index("recipe_tags_tag").on(t.tagId)]);

// A recipe's photo of the dish, as a JPEG resized in the browser. Kept apart from recipes, so
// queries for recipes don't load it, and not versioned
export const recipePhotos = sqliteTable("recipe_photos", {
  recipeId: integer("recipe_id")
    .primaryKey()
    .references(() => recipes.id),
  data: blob("data", { mode: "buffer" }).notNull(),
  // A small square of it for lists; null for photos uploaded before thumbnails, which then use data
  thumbnail: blob("thumbnail", { mode: "buffer" }),
  // ISO timestamp of the upload; part of the photo's URL, so a new photo isn't hidden by the cached old one
  updatedAt: text("updated_at").notNull(),
});

// Earlier states of a recipe, written out in the import format (recipeToText). Edits within
// 30 minutes of the latest version update it instead of adding one
export const recipeVersions = sqliteTable("recipe_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipes.id),
  // ISO timestamp of the version's last edit
  savedAt: text("saved_at").notNull(),
  text: text("text").notNull(),
}, (t) => [index("recipe_versions_recipe").on(t.recipeId, t.savedAt)]);

// Recipe text not imported yet, in the import format: made from a photo on one device, finished on another
export const recipeDrafts = sqliteTable("recipe_drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  // The chat with Claude that wrote it, as JSON [{ role, content }]; null for drafts typed or made from a photo
  chat: text("chat"),
  // The recipe this draft reworks, saved over it unless saved as a new recipe; null for a new recipe
  recipeId: integer("recipe_id").references(() => recipes.id),
  // ISO timestamp of the last save
  updatedAt: text("updated_at").notNull(),
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
  // Show the note on the shopping list too, e.g. "mind. 30% Fett"
  noteOnList: integer("note_on_list", { mode: "boolean" }).notNull().default(false),
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
  // "Include items in stock" when preparing; meals added or removed later follow it
  includeInStock: integer("include_in_stock", { mode: "boolean" }).notNull().default(false),
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
  // Null for a one-off entry, which has a name instead and isn't in the item catalog
  itemId: integer("item_id").references(() => items.id),
  // Only one-off entries (no item) have these: what to buy, and optionally where
  name: text("name"),
  storeId: integer("store_id").references(() => stores.id),
  categoryId: integer("category_id").references(() => itemCategories.id),
  // Combined amounts needed, one per unit kind; empty when no quantity is given
  amounts: text("amounts", { mode: "json" }).$type<Amount[]>().notNull(),
  // Parts of the amounts that come with a note from the recipe ("200 ml mind. 30% Fett")
  notes: text("notes", { mode: "json" }).$type<ListNote[]>().notNull().default(sql`'[]'`),
  bought: integer("bought", { mode: "boolean" }).notNull().default(false),
  source: text("source", { enum: ["meal_plan", "stock_deficit", "manual"] }).notNull(),
}, (t) => [
  uniqueIndex("shopping_list_items_list_item").on(t.shoppingListId, t.itemId),
  // Either an item from the catalog or a one-off name, never both
  check("shopping_list_items_item_or_name", sql`(item_id is null) <> (name is null)`),
]);

// Household-wide settings by key, such as the recipe preferences the chat with Claude follows
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
