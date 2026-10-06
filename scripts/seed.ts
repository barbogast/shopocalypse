import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../app/db/schema.ts";

const client = createClient({
  url: process.env.DATABASE_URL ?? "file:shopocalypse.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

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

const [pasta, tomatoes, onion, garlic, mince, chickenBreast, rice, lemon, eggs, cheese, salt, pepper] =
  await db
    .insert(schema.items)
    .values([
      { name: "Pasta", categoryId: pantry.id, storeId: store.id, defaultUnit: "g" },
      { name: "Tomatoes", categoryId: produce.id, storeId: store.id, defaultUnit: "can" },
      { name: "Onion", categoryId: produce.id, storeId: store.id, defaultUnit: "pcs" },
      { name: "Garlic", categoryId: produce.id, storeId: store.id },
      { name: "Minced beef", categoryId: meat.id, storeId: store.id, defaultUnit: "g" },
      { name: "Chicken breast", categoryId: meat.id, storeId: store.id, defaultUnit: "g" },
      { name: "Rice", categoryId: pantry.id, storeId: store.id, defaultUnit: "g" },
      { name: "Lemon", categoryId: produce.id, storeId: store.id, defaultUnit: "pcs" },
      { name: "Eggs", categoryId: dairy.id, storeId: store.id, defaultUnit: "pcs" },
      { name: "Cheese", categoryId: dairy.id, storeId: store.id, defaultUnit: "g" },
      { name: "Salt", categoryId: pantry.id, storeId: store.id, alwaysAvailable: true },
      { name: "Pepper", categoryId: pantry.id, storeId: store.id, alwaysAvailable: true },
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
  { recipeId: bolognese.id, itemId: pasta.id, quantity: 500, unit: "g" },
  { recipeId: bolognese.id, itemId: tomatoes.id, quantity: 1, unit: "can" },
  { recipeId: bolognese.id, itemId: onion.id, quantity: 1, unit: "pcs" },
  { recipeId: bolognese.id, itemId: garlic.id, quantity: 2, unit: "pcs" },
  { recipeId: bolognese.id, itemId: mince.id, quantity: 500, unit: "g" },
  { recipeId: bolognese.id, itemId: cheese.id, quantity: 50, unit: "g" },
  { recipeId: bolognese.id, itemId: salt.id, quantity: 10, unit: "g" },

  { recipeId: lemonChicken.id, itemId: chickenBreast.id, quantity: 400, unit: "g" },
  { recipeId: lemonChicken.id, itemId: lemon.id, quantity: 1, unit: "pcs" },
  { recipeId: lemonChicken.id, itemId: garlic.id, quantity: 2, unit: "pcs" },
  { recipeId: lemonChicken.id, itemId: salt.id, quantity: 1, unit: "tsp" },
  { recipeId: lemonChicken.id, itemId: pepper.id, quantity: null, unit: null },

  { recipeId: friedRice.id, itemId: rice.id, quantity: 250, unit: "g" },
  { recipeId: friedRice.id, itemId: eggs.id, quantity: 3, unit: "pcs" },
  { recipeId: friedRice.id, itemId: onion.id, quantity: 1, unit: "pcs" },
]);

const maxPosition = 100;
await db.insert(schema.mealSchedule).values([
  { position: maxPosition + 1, recipeId: bolognese.id },
  { position: maxPosition + 2, recipeId: lemonChicken.id },
  { position: maxPosition + 3, recipeId: friedRice.id },
]);

console.log("Seeded successfully.");
