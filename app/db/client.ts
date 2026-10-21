import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// A local file in development, the Turso database in production.
// Foreign keys are enforced on both: libSQL defaults PRAGMA foreign_keys to on, so
// every connection has it without setting it. None cascade, so deletes remove
// referencing rows first.
const client = createClient({
  url: process.env.DATABASE_URL ?? "file:shopocalypse.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
