-- recipeToText now writes the section headings in German. Rewrites the stored versions to match,
-- so the next save of a recipe isn't a new version that only changes its headings.
-- Each heading follows a blank line and starts its section's lines.
UPDATE `recipe_versions` SET `text` = replace(replace(replace(`text`,
  char(10) || char(10) || 'Ingredients' || char(10), char(10) || char(10) || 'Zutaten' || char(10)),
  char(10) || char(10) || 'Instructions' || char(10), char(10) || char(10) || 'Zubereitung' || char(10)),
  char(10) || char(10) || 'Comments' || char(10), char(10) || char(10) || 'Anmerkungen' || char(10));
