import { Alert, Anchor, Badge, Button, Card, Code, Container, Group, List, SimpleGrid, Stack, Table, Text, Textarea, Title } from "@mantine/core";
import { IconAlertCircle, IconCheck } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { eq } from "drizzle-orm";
import { Form, Link, redirect } from "react-router";
import { FormError } from "~/components/form-error";
import { IngredientName } from "~/components/ingredient-name";
import { Markdown } from "~/components/markdown";
import { SubmitButton } from "~/components/submit-button";
import { db } from "~/db/client";
import { importRecipe } from "~/db/recipes.server";
import { items, recipes } from "~/db/schema";
import { text } from "~/forms";
import { itemKey, parseRecipeText } from "~/recipe-import";
import { formatAmount, UNITS } from "~/units";
import type { Route } from "./+types/recipes.import";

const PLACEHOLDER = `Spaghetti Carbonara
Serves 4

Ingredients
400 g spaghetti
4 eggs
salt

Instructions
Boil the pasta…

Comments
Optional notes`;

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import Recipe – Shopocalypse" }];
}

export async function loader() {
  const itemNames = await db.select({ name: items.name }).from(items);
  const recipeNames = await db.select({ name: recipes.name }).from(recipes).where(eq(recipes.archived, false));
  return { itemNames: itemNames.map((i) => i.name), recipeNames: recipeNames.map((r) => r.name) };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  // Parsed again here rather than trusting the preview
  const { recipe, errors } = parseRecipeText(text(form, "text"));
  if (errors.length || recipe.servingSize == null) return { error: "Fix the errors in the text first.", imported: null };

  const { id, newItems } = await importRecipe({ ...recipe, servingSize: recipe.servingSize });
  if (newItems.length === 0) return redirect(`/recipes/${id}`);
  return { error: null, imported: { id, name: recipe.name, newItems } };
}

// The text format, kept in view while typing (the placeholder disappears)
function FormatHelp() {
  return (
    <Card withBorder radius="md" p="md">
      <Title order={5} mb="xs">Format</Title>
      <Code block mb="sm">{PLACEHOLDER}</Code>
      <List size="sm" spacing={4}>
        <List.Item><Code>Instructions</Code> and <Code>Comments</Code> are optional; instructions support markdown</List.Item>
        <List.Item>A quantity without a unit means pieces; a line without a quantity has none</List.Item>
        <List.Item>Quantities: <Code>1.5</Code>, <Code>1,5</Code>, <Code>1/2</Code>, <Code>1 1/2</Code>, <Code>½</Code>; no ranges</List.Item>
        <List.Item>Units: {UNITS.map((u) => u.label).join(", ")}, in English (<Code>tbsp</Code>) or spelled out (<Code>Esslöffel</Code>)</List.Item>
        <List.Item>A note after <Code> - </Code>, a comma or in parentheses is kept with the ingredient: <Code>1 onion - diced</Code></List.Item>
        <List.Item>Ingredients are matched to items by name (without the note); unknown names become new items</List.Item>
      </List>
    </Card>
  );
}

// Shown instead of the form once a recipe that created new items is imported
function Imported({ id, name, newItems }: { id: number; name: string; newItems: { id: number; name: string }[] }) {
  return (
    <Container size="sm" py="xl">
      <Alert color="green" variant="light" icon={<IconCheck size={16} />} title={`Imported "${name}"`} mb="lg">
        <Text size="sm" mb="xs">
          {newItems.length === 1 ? "This new item has" : `These ${newItems.length} new items have`} no store or shelf yet,
          so the shopping list can't sort {newItems.length === 1 ? "it" : "them"}:
        </Text>
        <List size="sm">
          {newItems.map((item) => (
            <List.Item key={item.id}>
              <Anchor component={Link} to={`/items/${item.id}`} size="sm">{item.name}</Anchor>
            </List.Item>
          ))}
        </List>
      </Alert>
      <Group>
        <Button component={Link} to={`/recipes/${id}`}>Open recipe</Button>
        <Button component={Link} to="/items" variant="subtle">All items</Button>
      </Group>
    </Container>
  );
}

export default function ImportRecipe({ loaderData, actionData }: Route.ComponentProps) {
  const { itemNames, recipeNames } = loaderData;
  const [input, setInput] = useState("");
  const { recipe, errors } = useMemo(() => parseRecipeText(input), [input]);
  const knownItems = useMemo(() => new Set(itemNames.map(itemKey)), [itemNames]);

  if (actionData?.imported) return <Imported {...actionData.imported} />;

  const newItemCount = recipe.ingredients.filter((ing) => !knownItems.has(itemKey(ing.name))).length;
  const nameTaken = recipe.name !== "" && recipeNames.some((n) => itemKey(n) === itemKey(recipe.name));
  const canImport = input.trim() !== "" && errors.length === 0;

  return (
    <Container size="lg" py="xl">
      <Title mb="lg">Import recipe</Title>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        <Form method="post">
          <Stack>
            <Textarea
              name="text"
              label="Recipe text"
              description="See the format below"
              placeholder={PLACEHOLDER}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              autosize
              minRows={16}
              autoFocus
              styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
            />
            <FormError error={actionData?.error} />
            <Group>
              <SubmitButton disabled={!canImport}>Import</SubmitButton>
              {canImport && newItemCount > 0 && (
                <Text size="sm" c="dimmed">
                  Creates {newItemCount} new item{newItemCount === 1 ? "" : "s"}
                </Text>
              )}
            </Group>
            <FormatHelp />
          </Stack>
        </Form>

        <Stack>
          {input.trim() !== "" && errors.length > 0 && (
            <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} py="xs">
              <List size="sm">
                {errors.map((e, i) => (
                  <List.Item key={i}>{e.line != null && <b>Line {e.line}: </b>}{e.message}</List.Item>
                ))}
              </List>
            </Alert>
          )}
          {nameTaken && (
            <Alert color="yellow" variant="light" py="xs">
              There's already a recipe called "{recipe.name}"; importing adds a second one.
            </Alert>
          )}

          <Card withBorder radius="md" p="md">
            <Title order={3}>{recipe.name || <Text span c="dimmed" inherit>Name</Text>}</Title>
            <Text size="sm" c="dimmed" mb="md">
              {recipe.servingSize ? `Serves ${recipe.servingSize}` : "Serves —"}
            </Text>

            <Title order={5} mb={4}>Ingredients</Title>
            <Table mb="md">
              <Table.Tbody>
                {recipe.ingredients.map((ing) => (
                  <Table.Tr key={ing.line}>
                    <Table.Td c="dimmed" style={{ width: 90 }}>{formatAmount(ing)}</Table.Td>
                    <Table.Td>
                      <IngredientName {...ing}>
                        {!knownItems.has(itemKey(ing.name)) && (
                          <Badge size="xs" variant="light" color="orange" ml={6}>new item</Badge>
                        )}
                      </IngredientName>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {recipe.ingredients.length === 0 && (
                  <Table.Tr>
                    <Table.Td c="dimmed">None yet.</Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>

            <Title order={5} mb={4}>Instructions</Title>
            {recipe.instructions ? <Markdown>{recipe.instructions}</Markdown> : <Text size="sm" c="dimmed" mb="md">—</Text>}

            <Title order={5} mb={4}>Comments</Title>
            {recipe.comments
              ? <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{recipe.comments}</Text>
              : <Text size="sm" c="dimmed">—</Text>}
          </Card>
        </Stack>
      </SimpleGrid>
    </Container>
  );
}
