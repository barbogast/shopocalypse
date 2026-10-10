import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { backfillRecipeVersions } from "../app/db/recipe-versions.ts";
import * as schema from "../app/db/schema.ts";

// Gives recipes without a version their first one. scripts/migrate.ts does this on deploy;
// this is for the local db, which `yarn db:migrate` migrates without it
const client = createClient({
  url: process.env.DATABASE_URL ?? "file:shopocalypse.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const added = await backfillRecipeVersions(drizzle(client, { schema }));
console.log(`Backfilled ${added} recipe version(s)`);
client.close();
