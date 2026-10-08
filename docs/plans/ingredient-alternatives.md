# Alternatives as a free-text field on recipe ingredients

## Context
Fully modelling alternatives (ingredient groups with a choice when preparing the list) is too much complexity. The workarounds we have now both fail:
- `Blumenkohl oder Brokkoli` creates a junk item called "Blumenkohl oder Brokkoli".
- `Blumenkohl, oder Brokkoli` stores "oder Brokkoli" as a note, and notes never reach the shopping list, which is exactly where you'd do the swap.

**Approach:** the first option stays the real item. Everything after "oder"/"or" goes into a new free-text `alternative` column on `recipe_ingredients`. It doesn't create an item and doesn't change amounts. It is shown wherever the ingredient is shown, **including the shopping list row**, where you'd see "or Brokkoli". It gets its own column instead of reusing `note`, because prep notes like "finely chopped" are noise on the shopping list. A separate column lets the list show only alternatives without guessing from string patterns.

## Changes

1. **Schema + migration.** Add `alternative: text("alternative")` to `recipeIngredients` in `app/db/schema.ts`. Comment it like `note`: "Free-text alternative, e.g. "Brokkoli"; not an item". Run `yarn db:generate --name ingredient_alternative`, which creates `drizzle/0013_ingredient_alternative.sql` (same shape as `0012_ingredient_note.sql`).

2. **Import parser** (`app/recipe-import.ts`).
   - Add `alternative: string | null` to `ParsedIngredient`.
   - After `splitNote`, split the name on the first ` oder ` / ` or ` (whole word, case-insensitive). The left side is the name and the right side is the alternative.
   - Note parts that start with `oder `/`or ` also become the alternative, with the prefix dropped. That covers `Blumenkohl, oder Brokkoli` and `Feta (oder Halloumi)`. Any other note parts stay notes.
   - `A oder B oder C` gives the alternative `B oder C`, stored as written.
   - Duplicate detection keys on the primary name only, which is unchanged.
   - Update the header comment with an example line: `500 g Blumenkohl oder Brokkoli`.
   - Error if the alternative is empty (e.g. `Blumenkohl oder`).

3. **Persistence** (`app/db/recipes.server.ts`). Write `alternative` in `importRecipe` and select it in `withIngredients`. Also select it in the recipe-detail query, wherever `note` is selected.

4. **Recipe editor** (`app/routes/recipes.$id.tsx`, around lines 84–89 and 160–193 and 315). Add an "Alternative, e.g. Brokkoli" `TextInput` next to the note input. Mirror the existing `note` state, edit prefill, reset, and `optionalText` + upsert handling.

5. **Display.** Add an `alternative` prop to `IngredientName` (`app/components/ingredient-name.tsx`) and render it as dimmed "or Brokkoli" above the note. The four call sites pass `{...ing}`, so they pick it up once their data has the field. The import preview comes from `ParsedIngredient`.

6. **Shopping list** (`app/routes/shopping.tsx`, around line 481).
   - Next to `recipesByItem`, build `alternativesByItem` from `listRecipes[].ingredients[].alternative`, de-duplicated.
   - Pass it to `ListItemRow` and render "or Brokkoli" as a dimmed line under the item name.
   - No loader or action changes, because `withIngredients` already supplies the data.

7. **Docs.** Add `alternative (optional)` to RecipeIngredient in `data_model.md`, with one line explaining that it's free text, not an item, and is shown on the shopping list.

## Out of scope
- Optional ingredients. They're a separate decision and can follow the same pattern later.
- Alternatives with their own quantity (`Blumenkohl oder 300 g Brokkoli`). The text is kept as written, not parsed.

## Verification
- `yarn test`: add cases to `app/recipe-import.test.ts` for each of these:
  - `Blumenkohl oder Brokkoli`
  - `500 g Blumenkohl oder Brokkoli, in Röschen` (alternative plus note)
  - `Blumenkohl, oder Brokkoli`
  - `Feta (or Halloumi)`
  - `A oder B oder C`
  - `Blumenkohl oder` (error)
  - a name containing "or" inside a word, e.g. `Chorizo`, which must not split
- `yarn typecheck`.
- `yarn db:migrate`, then `yarn dev`:
  - Import a recipe with `Blumenkohl oder Brokkoli` and confirm no "Blumenkohl oder Brokkoli" item is created.
  - Edit the alternative in the recipe editor.
  - Schedule the recipe, prepare the list, and check that the Blumenkohl row shows "or Brokkoli".
