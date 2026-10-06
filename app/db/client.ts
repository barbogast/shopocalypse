import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// A local file in development, the Turso database in production.
// Foreign keys aren't enforced: PRAGMA foreign_keys is per connection, and libSQL
// doesn't keep one connection (Turso requests are stateless, and local transactions
// get their own). The code keeps references intact itself instead.
const client = createClient({
  url: process.env.DATABASE_URL ?? "file:shopocalypse.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
