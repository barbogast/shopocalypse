import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll } from "vitest";

// Points the app's db client at a fresh, migrated file of its own. Import it in a test file before
// any module that uses the db. The file lasts for the whole test file, so tests create their own rows.
const dir = mkdtempSync(join(tmpdir(), "shopocalypse-test-"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
delete process.env.DATABASE_AUTH_TOKEN;

const { db } = await import("./client");
await migrate(db, { migrationsFolder: "drizzle" });

afterAll(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});
