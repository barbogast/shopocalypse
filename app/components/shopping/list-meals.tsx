import { Anchor, Button, Collapse, Group, List, NumberInput, Select, Stack } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Form, useActionData } from "react-router";
import { FormError } from "~/components/form-error";
import { RecipeDrawer } from "~/components/recipe-drawer";
import { Servings } from "~/components/servings";
import { SubmitButton } from "~/components/submit-button";
import type { action, ActiveListData, ListRecipe } from "~/routes/shopping";

// The list's meals, folded away behind a toggle to keep the page short;
// tapping a recipe opens its details without leaving the list
export function ListMeals({ recipes, allRecipes }: { recipes: ListRecipe[]; allRecipes: ActiveListData["allRecipes"] }) {
  const [shown, setShown] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = recipes.find((r) => r.key === openKey);

  const mealCount = recipes.reduce((sum, r) => sum + r.count, 0);

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
            {allRecipes.length > 0 && <AddRecipeForm recipes={allRecipes} />}
          </Stack>
        </Collapse>
      </Stack>

      <RecipeDrawer
        recipe={open}
        note={open && open.count > 1 ? `auf dieser Liste ×${open.count}` : undefined}
        onClose={() => setOpenKey(null)}
      />
    </>
  );
}

// Adds a meal to the list, and what it needs to the items
function AddRecipeForm({ recipes }: { recipes: ActiveListData["allRecipes"] }) {
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const actionData = useActionData<typeof action>();
  const servingSize = recipes.find((r) => String(r.id) === recipeId)?.servingSize;

  // Clear the picker once the meal is on the list
  useEffect(() => {
    if (actionData && "recipeAdded" in actionData) setRecipeId(null);
  }, [actionData]);

  return (
    <Form method="post">
      <input type="hidden" name="intent" value="add-recipe" />
      <Group align="flex-end" gap="xs">
        <Select
          name="recipeId"
          label="Mahlzeit hinzufügen"
          data={recipes.map((r) => ({ value: String(r.id), label: r.name }))}
          value={recipeId}
          onChange={setRecipeId}
          searchable
          placeholder="Rezept wählen…"
          style={{ flex: 1, minWidth: 140 }}
        />
        {/* Empty uses the recipe's serving size */}
        <NumberInput
          key={recipeId}
          name="servings"
          label="Portionen"
          min={1}
          allowDecimal={false}
          placeholder={servingSize ? String(servingSize) : "—"}
          style={{ width: 80 }}
        />
        <SubmitButton leftSection={<IconPlus size={16} />}>Hinzufügen</SubmitButton>
      </Group>
      <FormError error={actionData && "addRecipeError" in actionData ? actionData.addRecipeError : null} mt="xs" />
    </Form>
  );
}
