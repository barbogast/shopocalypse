import { Anchor, Drawer, Stack, Table, Text, Title } from "@mantine/core";
import { Link } from "react-router";
import { IngredientName } from "~/components/ingredient-name";
import { Markdown } from "~/components/markdown";
import { type Amount, formatAmount } from "~/units";

export type RecipeDetails = {
  id: number;
  name: string;
  servings: number;
  servingSize: number;
  instructions: string | null;
  comments: string | null;
  ingredients: (Amount & { itemId: number; name: string; note: string | null })[];
};

// Recipe details scaled to a meal's servings, shown without leaving the page
export function RecipeDrawer({ recipe, note, onClose }: { recipe: RecipeDetails | undefined; note?: string; onClose: () => void }) {
  return (
    <Drawer
      opened={recipe != null}
      onClose={onClose}
      position="bottom"
      size="85%"
      title={recipe && <Title order={3}>{recipe.name}</Title>}
    >
      {recipe && (
        <Stack>
          <Text size="sm" c="dimmed">
            {recipe.servings === recipe.servingSize
              ? `serves ${recipe.servingSize}`
              : `scaled to ${recipe.servings} servings (recipe serves ${recipe.servingSize})`}
            {note && ` · ${note}`}
          </Text>
          <Table>
            <Table.Tbody>
              {recipe.ingredients.map((ing) => (
                <Table.Tr key={ing.itemId}>
                  <Table.Td><IngredientName {...ing} /></Table.Td>
                  <Table.Td c="dimmed" style={{ width: 90 }}>{formatAmount(ing)}</Table.Td>
                </Table.Tr>
              ))}
              {recipe.ingredients.length === 0 && (
                <Table.Tr>
                  <Table.Td c="dimmed">No ingredients.</Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
          {recipe.instructions && (
            <div>
              <Text fw={500} size="sm">Instructions</Text>
              <Markdown>{recipe.instructions}</Markdown>
            </div>
          )}
          {recipe.comments && (
            <div>
              <Text fw={500} size="sm">Comments</Text>
              <Text style={{ whiteSpace: "pre-wrap" }}>{recipe.comments}</Text>
            </div>
          )}
          <Anchor component={Link} to={`/recipes/${recipe.id}`} size="sm">Open recipe page</Anchor>
        </Stack>
      )}
    </Drawer>
  );
}
