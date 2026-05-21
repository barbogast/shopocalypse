import {
  ActionIcon,
  Button,
  Container,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  TextInput,
  Title,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { and, asc, eq } from "drizzle-orm";
import { Form, redirect } from "react-router";
import { db } from "~/db/client";
import { items, recipeIngredients, recipes } from "~/db/schema";
import type { Route } from "./+types/recipes.$id";

export async function loader({ params }: Route.LoaderArgs) {
  const id = Number(params.id);
  const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
  if (!recipe) throw new Response("Not found", { status: 404 });

  const ingredients = await db
    .select({ itemId: items.id, name: items.name, quantity: recipeIngredients.quantity })
    .from(recipeIngredients)
    .innerJoin(items, eq(recipeIngredients.itemId, items.id))
    .where(eq(recipeIngredients.recipeId, id))
    .orderBy(asc(items.name));

  const allItems = await db.select({ id: items.id, name: items.name }).from(items).orderBy(items.name);

  return { recipe, ingredients, allItems };
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "save") {
    const name = String(form.get("name")).trim();
    const servingSize = Number(form.get("servingSize"));
    if (!name || servingSize < 1) return { error: "Name and serving size are required." };
    await db.update(recipes).set({ name, servingSize }).where(eq(recipes.id, id));
  }

  if (intent === "add-ingredient") {
    const itemId = Number(form.get("itemId"));
    const quantity = Number(form.get("quantity"));
    if (!itemId || quantity < 1) return { error: "Select an item and quantity." };
    await db
      .insert(recipeIngredients)
      .values({ recipeId: id, itemId, quantity })
      .onConflictDoUpdate({ target: [recipeIngredients.recipeId, recipeIngredients.itemId], set: { quantity } });
  }

  if (intent === "remove-ingredient") {
    const itemId = Number(form.get("itemId"));
    await db
      .delete(recipeIngredients)
      .where(and(eq(recipeIngredients.recipeId, id), eq(recipeIngredients.itemId, itemId)));
  }

  if (intent === "delete") {
    await db.delete(recipes).where(eq(recipes.id, id));
    return redirect("/recipes");
  }

  return null;
}

export default function RecipeDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { recipe, ingredients, allItems } = loaderData;
  const usedItemIds = new Set(ingredients.map((i) => i.itemId));
  const availableItems = allItems
    .filter((i) => !usedItemIds.has(i.id))
    .map((i) => ({ value: String(i.id), label: i.name }));

  return (
    <Container size="sm" py="xl">
      <Form method="post">
        <input type="hidden" name="intent" value="save" />
        <Stack mb="xl">
          <TextInput name="name" label="Name" defaultValue={recipe.name} required />
          <NumberInput name="servingSize" label="Serving size" defaultValue={recipe.servingSize} min={1} required />
          {actionData?.error && <p style={{ color: "red" }}>{actionData.error}</p>}
          <Group>
            <Button type="submit">Save</Button>
            <Form method="post" style={{ marginLeft: "auto" }}>
              <input type="hidden" name="intent" value="delete" />
              <Button type="submit" variant="subtle" color="red">Delete recipe</Button>
            </Form>
          </Group>
        </Stack>
      </Form>

      <Title order={3} mb="sm">Ingredients</Title>

      <Table mb="md">
        <Table.Tbody>
          {ingredients.map((ing) => (
            <Table.Tr key={ing.itemId}>
              <Table.Td>{ing.name}</Table.Td>
              <Table.Td c="dimmed" style={{ width: 60 }}>{ing.quantity}×</Table.Td>
              <Table.Td style={{ width: 40 }}>
                <Form method="post">
                  <input type="hidden" name="intent" value="remove-ingredient" />
                  <input type="hidden" name="itemId" value={ing.itemId} />
                  <ActionIcon variant="subtle" color="red" type="submit">
                    <IconTrash size={16} />
                  </ActionIcon>
                </Form>
              </Table.Td>
            </Table.Tr>
          ))}
          {ingredients.length === 0 && (
            <Table.Tr>
              <Table.Td c="dimmed">No ingredients yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      {availableItems.length > 0 && (
        <Form method="post">
          <input type="hidden" name="intent" value="add-ingredient" />
          <Group align="flex-end">
            <Select
              name="itemId"
              label="Add ingredient"
              data={availableItems}
              searchable
              style={{ flex: 1 }}
            />
            <NumberInput name="quantity" label="Qty" min={1} defaultValue={1} style={{ width: 80 }} />
            <Button type="submit">Add</Button>
          </Group>
        </Form>
      )}
    </Container>
  );
}
