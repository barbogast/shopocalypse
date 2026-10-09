import { createClient } from "@libsql/client";
import { renameSync, rmSync } from "node:fs";

// Replaces the local shopocalypse.db with a copy of the production database, for
// testing against real data. Fetches a SQL dump from Turso's GET /dump (a
// read-only token is enough), loads it into a separate file and only swaps that
// in once it's complete.
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

// The libsql:// URL from `turso db show --url` is served over HTTPS
const dumpUrl = new URL("/dump", url.replace(/^libsql:/, "https:"));
console.log(`Downloading from ${dumpUrl.host}`);
const response = await fetch(dumpUrl, { headers: { Authorization: `Bearer ${authToken}` } });
if (!response.ok) {
  console.error(`${response.status} ${response.statusText}: ${await response.text()}`);
  process.exit(1);
}
const dump = await response.text();

removeDb(PARTIAL);
const local = createClient({ url: `file:${PARTIAL}` });
// Production doesn't enforce foreign keys (see app/db/client.ts), so its rows
// needn't satisfy them, but the local client checks them by default
await local.executeMultiple(`PRAGMA foreign_keys=OFF;\n${dump}`);
// Inserting the rows already filled sqlite_sequence, and the dump's own entries
// for it came after; keep only those, as production's counters may be ahead
await local.execute(`
  DELETE FROM sqlite_sequence
  WHERE rowid NOT IN (SELECT max(rowid) FROM sqlite_sequence GROUP BY name)
`);
const { rows } = await local.execute("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'");
local.close();

removeDb(TARGET);
renameSync(PARTIAL, TARGET);
console.log(`Replaced ${TARGET} (${rows[0].n} tables). Restart \`yarn dev\` if it's running.`);
console.log("If this branch has migrations production doesn't, run `yarn db:migrate`.");
