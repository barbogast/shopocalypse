import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

// Like `drizzle-kit migrate`, but with plain log lines instead of a spinner,
// which build logs (e.g. Vercel's) can't render. Meant for deployed databases,
// so there's no fallback to the local file: use `yarn db:migrate` for that.
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}
const client = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function appliedCount() {
  try {
    const { rows } = await client.execute(
      "SELECT count(*) AS n FROM __drizzle_migrations",
    );
    return Number(rows[0].n);
  } catch {
    return 0; // table doesn't exist yet
  }
}

console.log(`Applying migrations to ${new URL(url).host || url}`);
const before = await appliedCount();
await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
const after = await appliedCount();
console.log(
  after > before
    ? `Applied ${after - before} migration(s), ${after} in total`
    : `No pending migrations (${after} applied)`,
);
client.close();
