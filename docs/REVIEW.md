# Shopocalypse – Code Review (2026-09-30, status updated 2026-10-09)

The original review covered commit `0f7c20f`. This update checks it against `3af85c1`, which is 88 commits later.
`yarn typecheck` passes, and `yarn test` passes (5 files, 75 tests).

## TL;DR – what's left, in order

1. **Offline ticking (G1 step 2).** Ticks are optimistic now, but they still fail with no connection. This is the last unmet requirement in `spec.md`.
2. **Confirm destructive actions** (U1). Delete store, delete shelf, discard list, delete recipe and remove history entry still happen on a single tap.
3. **Move the rest of the DB logic out of route modules** (O1). `shopping.tsx` has grown to 623 lines. `app/db/shopping.server.ts` only holds `getActiveList()` so far.
4. **Automate backups** (S2). The data is on Turso now, and the README only documents a manual dump.
5. Small leftovers: a bigger tick tap target (U2), the Vite `envFile` warning (S1), and limiting tick/untick/remove to the active list (B11).

**The stack changed since the review.** better-sqlite3 was replaced by libSQL/Turso, and the app is deployed on Vercel (`98bc5a5`, `1808e82`). The app also has HTTP Basic Auth (`9e90f38`) and applies migrations in production builds (`d8dfa04`). The review's stack verdict still holds. Section 5 below is updated to match.

---

## Done

| Item | What was done | Commit(s) |
|---|---|---|
| B1 Schedule add with no recipe crashes | Ignored instead of crashing | `f82a616` |
| B2 Auto-fill with invalid count crashes | Ignored | `bc69263` |
| B3 Two active lists on double submit | Transaction, existing-list check, `one_active_list` partial unique index (migration 0009) | `e3cfcb7` |
| B4 Double "Done cooking" writes two history rows | Fixed | `191c8d8` |
| B5 Dates in UTC/server zone | Recorded and shown in the user's local zone (`app/dates.ts`, `local-date-time.tsx`) | `53940eb` |
| B6 Duplicate shopping list items | Unique index on `(shopping_list_id, item_id)` (0010), amounts merged on add | `c3b7b74` |
| B7 Nested forms on stock page | Stock page removed with R1 | `73414dd` |
| B8 Non-integer servingSize | Rejected | `aa29fb4` |
| B9 Recipe deleted on missing intent | Explicit `delete` intent | `0dccc5f` |
| B10 Duplicate item names | `UNIQUE(name COLLATE NOCASE)` (0011), plus merge-duplicate-item feature | `f02a073`, `eef83a5` |
| B11 drawer key, `hasBeenCooked` in tx, discard transaction, `<Form>`/`<Link>`, cook Cancel fallback, page titles | Fixed | `1e8798e`, `05cae02`, `03d6897`, `2e0a2fb`, `0137e62`, `05d0a15` |
| G1 step 1: optimistic ticks | `useFetcher` plus `withPendingChanges` over `useFetchers()` | `3c31052` |
| G2/G3 spec reflects deferred stock and yes/no ticking | `spec.md` marks them _(deferred)_ | — |
| R1 Remove stock feature | Route, flag and branches removed. The `stock` table is kept. | `73414dd` |
| R2 Deduplication | `getActiveList()`, shared servings fallback, `withIngredients` everywhere, one `MoveButtons`, schema-derived prop types, list building as a pure function (`app/shopping-list.ts`) | `5c4f8df`, `cdc7eac`, `a808801`, `5539b17`, `1e56fb8`, `836e0e1` |
| R3 Form-parsing helpers | `app/forms.ts` (`int`, `text`, …) used throughout | `38415a9` |
| R4 Intent dispatch | `switch` that rejects unknown intents | `cff94e6` |
| R5 Error rendering | `FormError` (Mantine Alert) next to its form | `fa416b6`, `053b289` |
| T1 Tests | Vitest for units, list building, forms, dates and recipe import | `2eb8ef7` (+ later) |
| Cleanup | `app/welcome/`, `app.css`, `.dockerignore` and the template comment removed | `2f4a980` |
| Component moves | `Servings`/`ServingsControl` → `components/servings.tsx` | `bf2ada5` |
| Pending state on submit buttons | `SubmitButton` component | `c1a476b` |
| Migrations at deploy | Run in the production Vercel build | `d8dfa04` |
| Access control | Shared password via HTTP Basic Auth | `9e90f38` |
| Web app manifest / icons | Installable, favicon | `dc349cc`, `3af85c1` |

---

## Still open

### G1 – Ticking off items offline (steps 2–3)
Step 1 (optimistic UI) is done. Without a connection, the fetcher submit still fails and the tick is lost.
1. **Next:** add a `clientAction` on the shopping route that writes `tick`/`untick` to a `localStorage` outbox and applies them to the rendered list. Flush the outbox on `online`/`visibilitychange`, and have `clientLoader` merge the outbox over the server data. Ticks are idempotent, so replaying them is safe.
2. **Only if needed:** add a service worker (e.g. `vite-plugin-pwa`, network-first for `/shopping` and its `.data` request) so the page can also *load* offline. The manifest it depends on now exists. On Vercel, make sure the SW and Basic Auth work together: the SW's fetches carry the browser's cached credentials, but test it on a real phone.

### O1 – DB logic still lives in route modules
About 49 Drizzle calls are still in `app/routes/*`. `items.server.ts` and `recipes.server.ts` exist, and `shopping.server.ts` was started but only has `getActiveList()`.
- `shopping.tsx` (623 lines): move the `prepare`/`add-manual`/`tick`/`finish`/`discard` mutations into `shopping.server.ts`, and split the UI into `components/shopping/prepare-list.tsx` and `list-view.tsx`.
- `home.tsx` (394 lines): add a `schedule.server.ts`.
- `items.tsx` (417) and `recipes.$id.tsx` (411) have grown too and are the next candidates.
- Optionally move `units.ts`, `forms.ts`, `dates.ts` etc. from `app/` into `app/lib/`. This is cosmetic.

### B11 (remaining) – tick/untick/remove aren't scoped to the active list
`shopping.tsx:258-283` updates by row id alone. This is harmless for one family, and it will matter more once G1 replays queued ticks: a stale tick could then land on a completed list. Add `shoppingListId = activeList.id` to the `where` when doing G1.

### U1 – Destructive actions don't ask for confirmation
Only "merge item" confirms (`items.$id.tsx:88`). Delete store (which removes its shelves), delete shelf, discard list, delete recipe and remove history entry still go through on one tap. A Mantine `Popover` confirm or an undo notification on discard list and delete store covers the costly cases.

### U2 – Small tick target on the shopping list
The tick is still an `xs` button in a 60 px column (`shopping.tsx:486-490`). A whole-row tap target or a large checkbox would suit one-handed use in the shop.

### S1 – Vite `envFile` deprecation warning
This is still printed by every build and typecheck. It's harmless. Check it again after the next `@react-router/dev` upgrade.

### S2 – Backups
The README documents `turso db shell shopocalypse .dump > backup.sql`, but nothing runs it. Check whether your Turso plan's point-in-time restore is enough. If it isn't, add a scheduled dump, for example a GitHub Action on a cron that reuses `scripts/download-prod-db.ts`.

### Notes (no action needed)
- `drizzle/0003_*.sql` and `0007_*.sql` are empty migrations. Leave them, because they're in the journal.
- Swapping neighbours is still implemented twice (`moveShelf` vs. the schedule move), with slightly different semantics. Only unify them if you touch one.

---

## 5. Tech stack fit (updated)

| Piece | Verdict | Notes |
|---|---|---|
| React Router 7, framework mode, SSR | ✅ Keep | `clientAction`/`clientLoader` cover G1. |
| libSQL / Turso (was better-sqlite3) | ✅ Fine | Needed for serverless hosting. Transactions are async now. |
| Vercel (`@vercel/react-router`) | ✅ Fine | Migrations run in the production build. |
| Drizzle ORM + drizzle-kit | ✅ Keep | |
| Mantine 9 + Tabler icons | ✅ Keep | |
| react-markdown + remark-breaks | ✅ Keep | |
| Vitest | ✅ Added | |
| Vite 8 | ⚠️ Watch | See S1. |
