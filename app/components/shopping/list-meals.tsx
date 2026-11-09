import { Anchor, Button, Collapse, Group, List, Stack } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { Form } from "react-router";
import { RecipeDrawer } from "~/components/recipe-drawer";
import { RecipePicker } from "~/components/recipe-picker";
import { Servings } from "~/components/servings";
import { SubmitButton } from "~/components/submit-button";
import type { ActiveListData, ListRecipe } from "~/routes/shopping";

// The list's meals, folded away behind a toggle to keep the page short;
// tapping a recipe opens its details without leaving the list
export function ListMeals({ recipes, allRecipes }: { recipes: ListRecipe[]; allRecipes: ActiveListData["allRecipes"] }) {
  const [shown, setShown] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = recipes.find((r) => r.key === openKey);

  const [picking, setPicking] = useState(false);

  const mealCount = recipes.reduce((sum, r) => sum + r.count, 0);
  const counts = new Map<number, number>();
  for (const r of recipes) counts.set(r.id, (counts.get(r.id) ?? 0) + r.count);

  return (
    <>
      <Stack gap={4} mb="lg" align="flex-start">
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          px={0}
          leftSection={shown ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          onClick={() => setShown((s) => !s)}
          aria-expanded={shown}
        >
          {mealCount === 0 ? "Keine Mahlzeiten" : mealCount === 1 ? "1 Mahlzeit" : `${mealCount} Mahlzeiten`}
        </Button>
        <Collapse expanded={shown}>
          <Stack gap="sm">
            {recipes.length > 0 && (
              <List size="sm" c="dimmed">
                {recipes.map((r) => (
                  <List.Item key={r.key}>
                    <Group gap={4} wrap="nowrap">
                      <span>
                        <Anchor component="button" type="button" size="sm" onClick={() => setOpenKey(r.key)}>
                          {r.name}
                        </Anchor>
                        {r.servings !== r.servingSize && <Servings servings={r.servings} />}
                        {r.count > 1 && ` ×${r.count}`}
                      </span>
                      {/* Takes off one of a repeated meal at a time */}
                      <Form method="post">
                        <input type="hidden" name="intent" value="remove-recipe" />
                        <input type="hidden" name="id" value={r.listRecipeId} />
                        <SubmitButton size="compact-xs" variant="subtle" color="red" px={4} aria-label={`${r.name} entfernen`}>
                          <IconTrash size={12} />
                        </SubmitButton>
                      </Form>
                    </Group>
                  </List.Item>
                ))}
              </List>
            )}
            {allRecipes.length > 0 && (
              <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setPicking(true)}>
                Mahlzeiten hinzufügen
              </Button>
            )}
          </Stack>
        </Collapse>
      </Stack>

      <RecipePicker
        opened={picking}
        onClose={() => setPicking(false)}
        title="Zur Einkaufsliste hinzufügen"
        recipes={allRecipes}
        counts={counts}
        countLabel="auf der Liste"
        defaultServings=""
        addIntent="add-recipe"
        removeFields={(recipeId) => {
          const meal = [...recipes].reverse().find((r) => r.id === recipeId);
          return meal ? { intent: "remove-recipe", id: String(meal.listRecipeId) } : null;
        }}
      />

      <RecipeDrawer
        recipe={open}
        note={open && open.count > 1 ? `auf dieser Liste ×${open.count}` : undefined}
        onClose={() => setOpenKey(null)}
      />
    </>
  );
}
