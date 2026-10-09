import { createClient, type InStatement } from "@libsql/client";
import { existsSync, renameSync, rmSync } from "node:fs";

// Replaces the local shopocalypse.db with a copy of the production database, for
// testing against real data. Reads production through the same libSQL client the
// app uses (schema from sqlite_master, then every row), builds the copy in a
// separate file and only swaps it in once it's complete.
//
// Production's credentials have their own names so that nothing that reads
// DATABASE_URL (the app, drizzle-kit, the seed script) can pick them up by accident.
const url = process.env.PROD_DATABASE_URL;
const authToken = process.env.PROD_DATABASE_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("PROD_DATABASE_URL and PROD_DATABASE_AUTH_TOKEN must be set (see .env.example)");
  process.exit(1);
}

const TARGET = "shopocalypse.db";
const PARTIAL = `${TARGET}.download`;

const removeDb = (file: string) => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(file + suffix, { force: true });
};
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

// bigint so large integers survive the round trip unchanged
const prod = createClient({ url, authToken, intMode: "bigint" });
removeDb(PARTIAL);
const local = createClient({ url: `file:${PARTIAL}`, intMode: "bigint" });

console.log(`Downloading from ${new URL(url).host || url}`);

// Tables first, so rows can go in before indexes and triggers exist
const { rows: objects } = await prod.execute(`
  SELECT type, name, sql FROM sqlite_master
  WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%'
  ORDER BY type <> 'table', rowid
`);
const tables = objects.filter((o) => o.type === "table");
const statements: InStatement[] = tables.map((o) => String(o.sql));

for (const table of [...tables.map((o) => String(o.name)), "sqlite_sequence"]) {
  let result;
  try {
    result = await prod.execute(`SELECT * FROM ${quote(table)}`);
  } catch (error) {
    if (table === "sqlite_sequence") break; // no AUTOINCREMENT tables
    throw error;
  }
  const columns = result.columns.map(quote).join(", ");
  const placeholders = result.columns.map(() => "?").join(", ");
  const insert = `INSERT INTO ${quote(table)} (${columns}) VALUES (${placeholders})`;
  // Inserting explicit ids already fills sqlite_sequence; replace it with
  // production's, which may be ahead after deletes
  if (table === "sqlite_sequence") statements.push("DELETE FROM sqlite_sequence");
  for (const row of result.rows) statements.push({ sql: insert, args: Array.from(row) });
  if (table !== "sqlite_sequence") console.log(`  ${table}: ${result.rows.length} rows`);
}

statements.push(...objects.filter((o) => o.type !== "table").map((o) => String(o.sql)));

// migrate() runs everything in one transaction with foreign keys off: production
// doesn't enforce them (see app/db/client.ts), so its rows needn't satisfy them
await local.migrate(statements);

prod.close();
local.close();

if (existsSync(TARGET)) removeDb(TARGET);
renameSync(PARTIAL, TARGET);
console.log(`Replaced ${TARGET}. Restart \`yarn dev\` if it's running.`);
console.log("If this branch has migrations production doesn't, run `yarn db:migrate`.");
