import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../app/db/schema.ts";

const sqlite = new Database(process.env.DATABASE_URL ?? "shopocalypse.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite, { schema });

const [store] = await db
  .insert(schema.stores)
  .values({ name: "Supermarkt" })
  .returning();

const [produce] = await db
  .insert(schema.itemCategories)
  .values({ name: "Produce", storeId: store.id, position: 1 })
  .returning();
const [dairy] = await db
  .insert(schema.itemCategories)
  .values({ name: "Dairy", storeId: store.id, position: 2 })
  .returning();
const [pantry] = await db
  .insert(schema.itemCategories)
  .values({ name: "Pantry", storeId: store.id, position: 3 })
  .returning();
const [meat] = await db
  .insert(schema.itemCategories)
  .values({ name: "Meat", storeId: store.id, position: 4 })
  .returning();

const [pasta, tomatoes, onion, garlic, mince, chickenBreast, rice, lemon, eggs, cheese] =
  await db
    .insert(schema.items)
    .values([
      { name: "Pasta", categoryId: pantry.id, storeId: store.id },
      { name: "Tomatoes", categoryId: produce.id, storeId: store.id },
      { name: "Onion", categoryId: produce.id, storeId: store.id },
      { name: "Garlic", categoryId: produce.id, storeId: store.id },
      { name: "Minced beef", categoryId: meat.id, storeId: store.id },
      { name: "Chicken breast", categoryId: meat.id, storeId: store.id },
      { name: "Rice", categoryId: pantry.id, storeId: store.id },
      { name: "Lemon", categoryId: produce.id, storeId: store.id },
      { name: "Eggs", categoryId: dairy.id, storeId: store.id },
      { name: "Cheese", categoryId: dairy.id, storeId: store.id },
    ])
    .returning();

const [bolognese, lemonChicken, friedRice] = await db
  .insert(schema.recipes)
  .values([
    { name: "Spaghetti Bolognese", servingSize: 4 },
    { name: "Lemon Chicken", servingSize: 2 },
    { name: "Egg Fried Rice", servingSize: 2 },
  ])
  .returning();

await db.insert(schema.recipeIngredients).values([
  { recipeId: bolognese.id, itemId: pasta.id, quantity: 2 },
  { recipeId: bolognese.id, itemId: tomatoes.id, quantity: 3 },
  { recipeId: bolognese.id, itemId: onion.id, quantity: 1 },
  { recipeId: bolognese.id, itemId: garlic.id, quantity: 2 },
  { recipeId: bolognese.id, itemId: mince.id, quantity: 1 },

  { recipeId: lemonChicken.id, itemId: chickenBreast.id, quantity: 2 },
  { recipeId: lemonChicken.id, itemId: lemon.id, quantity: 1 },
  { recipeId: lemonChicken.id, itemId: garlic.id, quantity: 2 },

  { recipeId: friedRice.id, itemId: rice.id, quantity: 1 },
  { recipeId: friedRice.id, itemId: eggs.id, quantity: 3 },
  { recipeId: friedRice.id, itemId: onion.id, quantity: 1 },
]);

const maxPosition = 100;
await db.insert(schema.mealSchedule).values([
  { position: maxPosition + 1, recipeId: bolognese.id },
  { position: maxPosition + 2, recipeId: lemonChicken.id },
  { position: maxPosition + 3, recipeId: friedRice.id },
]);

console.log("Seeded successfully.");
