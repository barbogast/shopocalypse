# Shopocalypse

Meal schedule and shopping list for the family. See `spec.md` for what it does
and `data_model.md` for the tables.

React Router 7 (framework mode) · Drizzle ORM on libSQL · Mantine.

## Development

```sh
yarn install
yarn db:migrate      # creates/updates shopocalypse.db
yarn db:seed         # optional sample data
yarn dev
yarn test
```

Locally the database is the file `shopocalypse.db` and there's no password.
Environment variables are listed in `.env.example`.

## Deployment (Vercel + Turso)

The app runs as Vercel functions in `fra1` (see `vercel.json`) against a Turso
database. Each query is a round trip to Turso, so keep both in the same region.

### One-time setup

1. Create the Turso database in Frankfurt, either empty or from the local file:

   ```sh
   turso auth login
   # Databases live in a group, which sets the location. Pick the Frankfurt
   # code from `turso db locations` (or skip this if your group is already there):
   turso group create default --location <frankfurt-code>
   # Empty:
   turso db create shopocalypse
   # Or with the existing data (Turso imports WAL-mode files with the WAL checkpointed):
   sqlite3 shopocalypse.db ".backup export.db"
   sqlite3 export.db "PRAGMA journal_mode=wal; PRAGMA wal_checkpoint(truncate);"
   turso db create shopocalypse --from-file export.db

   turso db show shopocalypse --url        # → DATABASE_URL
   turso db tokens create shopocalypse     # → DATABASE_AUTH_TOKEN
   ```

2. Apply the migrations (skip if you imported a file that's up to date):

   ```sh
   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… yarn db:migrate
   ```

3. Import the repository in Vercel. The React Router framework preset is
   detected. Under *Settings → Environment Variables* set `DATABASE_URL`,
   `DATABASE_AUTH_TOKEN` and `APP_PASSWORD`. Deploys without `APP_PASSWORD` answer
   every request with an error rather than run unprotected.

### Schema changes

```sh
yarn db:generate --name <change>     # locally, after editing app/db/schema.ts
yarn db:migrate                      # local file
```

Production deploys apply pending migrations to Turso before building (the
`vercel-build` script); a failed migration fails the deploy. Preview builds
skip them. Migrations must keep working with the code that's still live until
the deploy finishes, and with older deploys you might roll back to, since
Vercel's rollback doesn't undo them, e.g. add columns before using them and
don't drop or rename ones that live code reads.

### Notes

- Preview deployments use the same environment variables unless you scope them
  to *Production*. Point previews at a separate Turso database if they shouldn't
  touch the family's data.
- Foreign keys aren't enforced (see `app/db/client.ts`); deletes clean up
  related rows in code.
- Back up with `turso db shell shopocalypse .dump > backup.sql`.
