import { defineConfig } from "drizzle-kit";

// DATABASE_URL is a libSQL URL: file:shopocalypse.db locally (the default), or
// libsql://<db>-<org>.turso.io with DATABASE_AUTH_TOKEN for Turso
export default defineConfig({
  schema: "./app/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL || "file:shopocalypse.db",
    // drizzle-kit loads .env itself and rejects an empty token, which .env.example leaves blank
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  },
});
